/**
 * InventoryService.gs
 * Inventory item master data and stock operations (Sprint 5):
 * items (CRUD + deactivate/reactivate), stock-take adjustments, and
 * the item balance read model (on-hand, weighted-average cost, value,
 * low-stock flag). Movements are delegated to InventoryMovementService.
 */

var InventoryService = (function () {
  'use strict';

  var CATEGORIES = ['BATTERIES', 'PRINT_MATERIALS', 'PROPS', 'CABLE', 'KIT', 'PAPER', 'MISC'];
  var UNITS = ['UNIT', 'PACK', 'BOX', 'SET', 'METER'];
  var COST_METHODS = ['WEIGHTED_AVG'];

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function requireItem(itemId) {
    var record = InventoryRepository.findItemById(itemId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.ITEM_NOT_FOUND, 'The inventory item was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  /**
   * Full read model for one item: master data + current balance.
   */
  function getItemDetail(itemId) {
    assertDatabase();
    var record = requireItem(itemId);
    var batches = InventoryRepository.listBatches(itemId);
    var balance = InventoryValuationService.computeBalance(batches);
    return {
      item: RepositoryService.toPublicRecord(record),
      balance: balance,
      lowStock: balance.onHand > 0 && balance.onHand <= number(record.reorder_level) && number(record.reorder_level) > 0
    };
  }

  /**
   * Enriched list: adds computed balance + low-stock flag per item.
   * Supports search/category/unit/activeOnly filters and pagination.
   * All batches are read ONCE per request and grouped in memory
   * (no per-item full-sheet reads - performance contract).
   */
  function listItems(filters) {
    assertDatabase();
    filters = filters || {};
    var page = InventoryRepository.listItems(filters);
    var batchRecords = RepositoryService.readAll(InventoryRepository.SHEET_BATCHES);
    var batchesByItem = {};
    for (var b = 0; b < batchRecords.length; b++) {
      var key = String(batchRecords[b].item_id);
      batchesByItem[key] = batchesByItem[key] || [];
      batchesByItem[key].push(batchRecords[b]);
    }
    var enriched = [];
    for (var i = 0; i < page.items.length; i++) {
      var item = page.items[i];
      var balance = InventoryValuationService.computeBalance(batchesByItem[String(item.itemId)] || []);
      enriched.push({
        item: item,
        balance: balance,
        lowStock: balance.onHand > 0 && balance.onHand <= number(item.reorderLevel) && number(item.reorderLevel) > 0
      });
    }
    return {
      items: enriched,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /**
   * Stock status for an item against the low-stock multiplier.
   * Mirrors InventoryReportService R11 so the page summary always
   * agrees with the Dashboard low-stock alert.
   */
  function stockStatus(item, balance) {
    if (String(item.isActive) === 'FALSE' || item.isActive === false) {
      return 'INACTIVE';
    }
    if (balance.onHand <= 0) {
      return 'OUT_OF_STOCK';
    }
    var multiplier = Number(SettingsService.getLowStockMultiplier()) || 1;
    var threshold = number(item.reorderLevel) * multiplier;
    if (number(item.reorderLevel) > 0 && balance.onHand <= threshold) {
      return 'LOW_STOCK';
    }
    return 'IN_STOCK';
  }

  /**
   * Single-request page model for the Inventory screen: summary KPI
   * totals, enriched rows with status, in-memory pagination, and the
   * lookup options. Two sheet reads per request (items + batches).
   */
  function getPageData(filters) {
    assertDatabase();
    filters = filters || {};
    var full = InventoryRepository.listItems({
      search: filters.search,
      category: filters.category,
      unit: filters.unit,
      activeOnly: filters.activeOnly,
      pageSize: 0
    });
    var batchRecords = RepositoryService.readAll(InventoryRepository.SHEET_BATCHES);
    var batchesByItem = {};
    for (var b = 0; b < batchRecords.length; b++) {
      var key = String(batchRecords[b].item_id);
      batchesByItem[key] = batchesByItem[key] || [];
      batchesByItem[key].push(batchRecords[b]);
    }

    var enriched = [];
    var totalValue = 0;
    var lowStockCount = 0;
    var outOfStockCount = 0;
    var activeCount = 0;
    var locations = [];
    var seenLocations = {};

    for (var i = 0; i < full.items.length; i++) {
      var item = full.items[i];
      var balance = InventoryValuationService.computeBalance(batchesByItem[String(item.itemId)] || []);
      var status = stockStatus(item, balance);
      if (status !== 'INACTIVE') {
        activeCount++;
        totalValue += balance.value;
        if (status === 'LOW_STOCK') {
          lowStockCount++;
        }
        if (status === 'OUT_OF_STOCK') {
          outOfStockCount++;
        }
      }
      var location = ValidationService.trimSafe(item.storageLocation);
      if (location && !seen(seenLocations, location)) {
        locations.push(location);
      }
      enriched.push({
        item: item,
        balance: balance,
        lowStock: status === 'LOW_STOCK' || status === 'OUT_OF_STOCK',
        status: status
      });
    }

    var total = enriched.length;
    var page = Math.max(Number(filters.page) || 1, 1);
    var requested = Number(filters.pageSize);
    var pageSize = requested === 0 ? total : Math.min(Math.max(requested || 50, 1), 100);
    var start = (page - 1) * pageSize;

    return {
      summary: {
        totalItems: total,
        activeItems: activeCount,
        totalValue: InventoryValuationService.roundMoney(totalValue),
        lowStockCount: lowStockCount,
        outOfStockCount: outOfStockCount
      },
      items: enriched.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize,
      lookups: {
        categories: CATEGORIES.slice(0),
        units: UNITS.slice(0),
        locations: locations.sort(),
        costMethods: COST_METHODS.slice(0)
      }
    };
  }

  function seen(map, key) {
    var k = String(key).toLowerCase();
    if (map[k]) {
      return true;
    }
    map[k] = true;
    return false;
  }

  /**
   * Detail view in one request: item, balance, batches, and the recent
   * movement page. Full movement history stays on getInventoryMovements.
   */
  function getItemDetailView(itemId) {
    assertDatabase();
    var record = requireItem(itemId);
    var item = RepositoryService.toPublicRecord(record);
    var batches = InventoryRepository.listBatches(itemId);
    var balance = InventoryValuationService.computeBalance(batches);
    var publicBatches = [];
    for (var i = 0; i < batches.length; i++) {
      publicBatches.push(RepositoryService.toPublicRecord(batches[i]));
    }
    var movements = InventoryRepository.listMovements({ itemId: itemId, page: 1, pageSize: 50 });
    return {
      item: item,
      balance: balance,
      lowStock: balance.onHand > 0 && balance.onHand <= number(record.reorder_level) && number(record.reorder_level) > 0,
      batches: publicBatches,
      movements: movements
    };
  }

  /**
   * Opening stock: the very first stock-entry for an item (owner's
   * existing stock). Delegates to the STOCK_IN/OPENING movement path;
   * the audit action OPENING_STOCK_RECORDED marks the flow.
   */
  function recordOpeningStock(payload) {
    return InventoryMovementService.recordStockIn({
      itemId: payload && payload.itemId,
      quantity: payload && payload.quantity,
      unitCost: payload && payload.unitCost,
      landingCost: payload && payload.landingCost,
      receivedAt: payload && payload.receivedAt,
      source: InventoryMovementService.SOURCE_OPENING,
      sourceRefId: payload && payload.sourceRefId,
      reason: payload && payload.reason
    });
  }

  function validateItemPayload(payload) {
    var sku = ValidationService.trimSafe(payload.sku);
    var name = ValidationService.trimSafe(payload.name);
    if (!sku) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'SKU is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!name) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Item name is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var categoryCheck = ValidationService.isEnum(payload.category, CATEGORIES, 'Category');
    if (!categoryCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, categoryCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var unitCheck = ValidationService.isEnum(payload.unit, UNITS, 'Unit');
    if (!unitCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, unitCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var unitCheck = ValidationService.isEnum(payload.unit, UNITS, 'Unit');
    if (!unitCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, unitCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var costMethod = payload.costMethod || 'WEIGHTED_AVG';
    var methodCheck = ValidationService.isEnum(costMethod, COST_METHODS, 'Cost method');
    if (!methodCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, methodCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (number(payload.reorderLevel) < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Reorder level cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return {
      sku: sku,
      name: name,
      category: payload.category,
      unit: payload.unit,
      reorderLevel: number(payload.reorderLevel),
      costMethod: costMethod,
      storageLocation: ValidationService.trimSafe(payload.storageLocation),
      notes: ValidationService.trimSafe(payload.notes)
    };
  }

  function createItem(payload) {
    assertDatabase();
    var data = validateItemPayload(payload);
    var existing = InventoryRepository.findBySku(data.sku);
    if (existing && (String(existing.is_active) !== 'FALSE' && existing.is_active !== false)) {
      throw ErrorService.create(ErrorService.CODES.ITEM_SKU_CONFLICT,
        'An active inventory item with this SKU already exists.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var itemId = IdService.generateId('ITM');
      RepositoryService.appendRecord(InventoryRepository.SHEET_ITEMS, {
        item_id: itemId,
        sku: data.sku,
        name: data.name,
        category: data.category,
        unit: data.unit,
        reorder_level: data.reorderLevel,
        cost_method: data.costMethod,
        storage_location: data.storageLocation,
        is_active: 'TRUE',
        notes: data.notes,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.INVENTORY_ITEM_CREATED, 'InventoryItems', itemId,
        'Created inventory item ' + data.name + ' (' + data.sku + ').');
      return getItemDetail(itemId);
    }, 'inv-item-create');
  }

  function updateItem(payload) {
    assertDatabase();
    var record = requireItem(payload.itemId);
    if (String(record.is_active) === 'FALSE' || record.is_active === false) {
      throw ErrorService.create(ErrorService.CODES.ITEM_INACTIVE, 'Inactive items cannot be edited.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var data = validateItemPayload(payload);
    var existing = InventoryRepository.findBySku(data.sku);
    if (existing && String(existing.item_id) !== String(payload.itemId) &&
      (String(existing.is_active) !== 'FALSE' && existing.is_active !== false)) {
      throw ErrorService.create(ErrorService.CODES.ITEM_SKU_CONFLICT,
        'An active inventory item with this SKU already exists.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(InventoryRepository.SHEET_ITEMS, payload.itemId, {
        sku: data.sku,
        name: data.name,
        category: data.category,
        unit: data.unit,
        reorder_level: data.reorderLevel,
        cost_method: data.costMethod,
        storage_location: data.storageLocation,
        notes: data.notes,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.INVENTORY_ITEM_UPDATED, 'InventoryItems', payload.itemId,
        'Updated inventory item ' + data.name + '.');
      return getItemDetail(payload.itemId);
    }, 'inv-item-update');
  }

  function setActive(itemId, active, reason) {
    assertDatabase();
    var record = requireItem(itemId);
    var currentlyActive = String(record.is_active) !== 'FALSE' && record.is_active !== false;
    if (currentlyActive === active) {
      throw ErrorService.create(ErrorService.CODES.CONFLICT,
        active ? 'The item is already active.' : 'The item is already inactive.', null, ErrorService.CATEGORY_CONFLICT);
    }
    if (!active) {
      var batches = InventoryRepository.listBatches(itemId);
      var onHand = InventoryValuationService.onHand(batches);
      if (onHand > 0) {
        throw ErrorService.create(ErrorService.CODES.CONFLICT,
          'Items with on-hand stock cannot be deactivated. Sell, use, or adjust the stock first.',
          { onHand: onHand }, ErrorService.CATEGORY_CONFLICT);
      }
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(InventoryRepository.SHEET_ITEMS, itemId, {
        is_active: active ? 'TRUE' : 'FALSE',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(active
          ? AuditService.ACTIONS.INVENTORY_ITEM_REACTIVATED
          : AuditService.ACTIONS.INVENTORY_ITEM_DEACTIVATED,
        'InventoryItems', itemId,
        (active ? 'Reactivated' : 'Deactivated') + ' inventory item ' + record.name +
          (reason ? '. Reason: ' + reason : '.'));
      return getItemDetail(itemId);
    }, 'inv-item-active');
  }

  /**
   * Stock-take / correction adjustment. quantity positive adds stock
   * (into the newest batch or a fresh batch), negative removes it
   * (oldest-first, guarded against negative stock).
   */
  function adjustStock(payload) {
    assertDatabase();
    requireItem(payload.itemId);
    var quantity = number(payload.quantity);
    if (quantity === 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Adjustment quantity cannot be zero.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var reason = ValidationService.trimSafe(payload.reason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'An adjustment reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (quantity > 0) {
      return InventoryMovementService.recordStockIn({
        itemId: payload.itemId,
        quantity: quantity,
        unitCost: number(payload.unitCost),
        landingCost: 0,
        receivedAt: DateService.toIsoDate(DateService.now()),
        source: payload.source || InventoryMovementService.SOURCE_STOCK_TAKE,
        sourceRefId: payload.sourceRefId || '',
        reason: reason
      });
    }
    return InventoryMovementService.recordUsage({
      itemId: payload.itemId,
      quantity: Math.abs(quantity),
      movementType: payload.movementType === 'WRITE_OFF'
        ? InventoryMovementService.TYPE_WRITE_OFF
        : InventoryMovementService.TYPE_USAGE,
      source: payload.source || InventoryMovementService.SOURCE_STOCK_TAKE,
      sourceRefId: payload.sourceRefId || '',
      reason: reason
    });
  }

  function listMovements(filters) {
    assertDatabase();
    return InventoryRepository.listMovements(filters);
  }

  return {
    getItemDetail: getItemDetail,
    getItemDetailView: getItemDetailView,
    getPageData: getPageData,
    listItems: listItems,
    createItem: createItem,
    updateItem: updateItem,
    setActive: setActive,
    adjustStock: adjustStock,
    recordOpeningStock: recordOpeningStock,
    listMovements: listMovements,
    CATEGORIES: CATEGORIES,
    UNITS: UNITS,
    COST_METHODS: COST_METHODS
  };
})();