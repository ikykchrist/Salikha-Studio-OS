/**
 * InventoryRepository.gs
 * Sheet access and search for inventory items, batches, and movements
 * (Sprint 5). No business decisions here; InventoryService and
 * InventoryValuationService enforce valuation and stock rules.
 */

var InventoryRepository = (function () {
  'use strict';

  var SHEET_ITEMS = 'InventoryItems';
  var SHEET_BATCHES = 'InventoryBatches';
  var SHEET_MOVEMENTS = 'InventoryMovements';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_ITEMS);
    SheetSchemaService.getSchema(SHEET_BATCHES);
    SheetSchemaService.getSchema(SHEET_MOVEMENTS);
  }

  function findItemById(itemId) {
    return RepositoryService.findById(SHEET_ITEMS, itemId);
  }

  function getItem(itemId) {
    var record = findItemById(itemId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function findBySku(sku) {
    var records = RepositoryService.readAll(SHEET_ITEMS);
    var needle = String(sku || '').trim().toLowerCase();
    if (!needle) {
      return null;
    }
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].sku || '').toLowerCase() === needle) {
        return records[i];
      }
    }
    return null;
  }

  /**
   * Lists inventory items with filters and pagination.
   * @param {Object} filters search, category, unit, activeOnly, page, pageSize
   */
  function listItems(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_ITEMS);
    var search = ClientRepository.normalizeSearch(filters.search);
    var category = filters.category;
    var unit = filters.unit;
    var activeOnly = !!filters.activeOnly;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (activeOnly && (String(r.is_active) === 'FALSE' || r.is_active === false)) {
        continue;
      }
      if (category && String(r.category) !== String(category)) {
        continue;
      }
      if (unit && String(r.unit) !== String(unit)) {
        continue;
      }
      if (search) {
        var haystack = [r.sku, r.name, r.storage_location, r.category].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var page = Math.max(Number(filters.page) || 1, 1);
    var requested = Number(filters.pageSize);
    var pageSize = requested === 0 ? out.length : Math.min(Math.max(requested || 50, 1), 100);
    var total = out.length;
    var start = (page - 1) * pageSize;
    return {
      items: out.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  function findBatchById(batchId) {
    return RepositoryService.findById(SHEET_BATCHES, batchId);
  }

  function getBatch(batchId) {
    var record = findBatchById(batchId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * All batches for an item, ordered oldest-received first.
   */
  function listBatches(itemId) {
    var records = RepositoryService.readAll(SHEET_BATCHES);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      if (!itemId || String(records[i].item_id) === String(itemId)) {
        out.push(records[i]);
      }
    }
    out.sort(function (a, b) {
      return String(a.received_at || '').localeCompare(String(b.received_at || '')) ||
        String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    return out;
  }

  /**
   * All movements with filters (itemId, movementType, source) and
   * pagination. Newest first.
   */
  function listMovements(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_MOVEMENTS);
    var itemId = filters.itemId;
    var movementType = filters.movementType;
    var source = filters.source;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (itemId && String(r.item_id) !== String(itemId)) {
        continue;
      }
      if (movementType && String(r.movement_type) !== String(movementType)) {
        continue;
      }
      if (source && String(r.source) !== String(source)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || 50, 1), 100);
    var total = out.length;
    var start = (page - 1) * pageSize;
    return {
      items: out.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  function getMovementCount() {
    return RepositoryService.readAll(SHEET_MOVEMENTS).length;
  }

  return {
    assertDatabase: assertDatabase,
    findItemById: findItemById,
    getItem: getItem,
    findBySku: findBySku,
    listItems: listItems,
    findBatchById: findBatchById,
    getBatch: getBatch,
    listBatches: listBatches,
    listMovements: listMovements,
    getMovementCount: getMovementCount,
    SHEET_ITEMS: SHEET_ITEMS,
    SHEET_BATCHES: SHEET_BATCHES,
    SHEET_MOVEMENTS: SHEET_MOVEMENTS
  };
})();