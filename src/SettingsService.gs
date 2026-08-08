// SettingsService.gs
//
// Business-level settings stored in SystemMetadata (values only; secrets
// never live here). Sprint 4 uses it for the operating cost allocation
// toggle. Access is always under a lock and audited when changed.

var SettingsService = (function () {
  'use strict';

  var KEY_ALLOCATE_OPERATING_COSTS = 'ALLOCATE_OPERATING_COSTS';
  var KEY_LOW_STOCK_MULTIPLIER = 'LOW_STOCK_MULTIPLIER';

  var DEFAULT_ALLOCATE = true;
  var DEFAULT_LOW_STOCK_MULTIPLIER = 1;

  /**
   * Reads the setting as a boolean. Falls back to the documented default
   * (TRUE) when absent or malformed. Read-only; never throws for a
   * missing value.
   */
  function isAllocateOperatingCosts() {
    var record = null;
    try {
      record = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, KEY_ALLOCATE_OPERATING_COSTS, 'metadata_key');
    } catch (err) {
      LoggerService.warn('SettingsService.isAllocateOperatingCosts', 'Setting unreadable; using default', { error: ErrorService.normalize(err).code });
      return DEFAULT_ALLOCATE;
    }
    if (!record || record.metadata_value === undefined || record.metadata_value === null || record.metadata_value === '') {
      return DEFAULT_ALLOCATE;
    }
    return String(record.metadata_value).toUpperCase() === 'TRUE';
  }

  /**
   * Sets the operating cost allocation toggle. Owner-managed; every
   * change is audited. When switched OFF all pending allocation
   * computations yield 0 until re-enabled.
   */
  function setAllocateOperatingCosts(value, actor) {
    var enabled = !!value;
    return LockManager.run(function () {
      var existing = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, KEY_ALLOCATE_OPERATING_COSTS);
      var before = existing ? String(existing.metadata_value) : null;
      var after = enabled ? 'TRUE' : 'FALSE';
      if (String(before).toUpperCase() === after) {
        return { key: KEY_ALLOCATE_OPERATING_COSTS, value: enabled, changed: false };
      }
      if (existing) {
        RepositoryService.updateById(SheetSchemaService.SHEET_SYSTEM_METADATA, KEY_ALLOCATE_OPERATING_COSTS, {
          metadata_value: after,
          description: 'TRUE when operating costs are allocated to bookings (revenue share).',
          updated_at: DateService.now(),
          updated_by: actor
        });
      } else {
        RepositoryService.appendRecord(SheetSchemaService.SHEET_SYSTEM_METADATA, {
          metadata_key: KEY_ALLOCATE_OPERATING_COSTS,
          metadata_value: after,
          description: 'TRUE when operating costs are allocated to bookings (revenue share).',
          updated_at: DateService.now(),
          updated_by: actor
        });
      }
      AuditService.info(AuditService.ACTIONS.OPERATING_ALLOCATION_RECALCULATED,
        'SystemMetadata', KEY_ALLOCATE_OPERATING_COSTS,
        'Operating cost allocation ' + (enabled ? 'enabled' : 'disabled'),
        { beforeData: { value: before }, afterData: { value: after } });
      // Recompute stored snapshots so the toggle takes effect immediately.
      var refreshed = null;
      try {
        refreshed = BookingProfitService.recalculateAllBookings();
      } catch (ignored) {
        LoggerService.warn('SettingsService.setAllocateOperatingCosts', 'Booking refresh skipped', { error: ErrorService.normalize(ignored).code });
      }
      return { key: KEY_ALLOCATE_OPERATING_COSTS, value: enabled, changed: true, refreshedBookings: refreshed ? refreshed.recalculated : 0 };
    }, 'settings-metadata');
  }

  /**
   * Low-stock threshold multiplier (reorder level x multiplier). Stored
   * in SystemMetadata as LOW_STOCK_MULTIPLIER; defaults to 1 when
   * absent, malformed, or negative. Read-only; never throws.
   */
  function getLowStockMultiplier() {
    try {
      var record = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, KEY_LOW_STOCK_MULTIPLIER, 'metadata_key');
      if (!record || record.metadata_value === undefined || record.metadata_value === null || record.metadata_value === '') {
        return DEFAULT_LOW_STOCK_MULTIPLIER;
      }
      var n = Number(record.metadata_value);
      if (isNaN(n) || n < 0) {
        return DEFAULT_LOW_STOCK_MULTIPLIER;
      }
      return n;
    } catch (err) {
      LoggerService.warn('SettingsService.getLowStockMultiplier', 'Setting unreadable; using default', { error: ErrorService.normalize(err).code });
      return DEFAULT_LOW_STOCK_MULTIPLIER;
    }
  }

  /**
   * Public settings payload for the Settings page and booking
   * profitability calls. Never exposes secrets or IDs.
   */
  function getBusinessSettings() {
    var allocationEnabled = isAllocateOperatingCosts();
    var timezone = Config.get('TIMEZONE') || 'Asia/Manila';
    var currency = Config.get('CURRENCY') || 'PHP';
    return {
      allocateOperatingCosts: allocationEnabled,
      timezone: timezone,
      currency: currency
    };
  }

  return {
    isAllocateOperatingCosts: isAllocateOperatingCosts,
    setAllocateOperatingCosts: setAllocateOperatingCosts,
    getLowStockMultiplier: getLowStockMultiplier,
    getBusinessSettings: getBusinessSettings,
    KEY_ALLOCATE_OPERATING_COSTS: KEY_ALLOCATE_OPERATING_COSTS,
    DEFAULT_ALLOCATE: DEFAULT_ALLOCATE,
    KEY_LOW_STOCK_MULTIPLIER: KEY_LOW_STOCK_MULTIPLIER,
    DEFAULT_LOW_STOCK_MULTIPLIER: DEFAULT_LOW_STOCK_MULTIPLIER
  };
})();
