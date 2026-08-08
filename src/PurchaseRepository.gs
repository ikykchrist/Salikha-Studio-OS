/**
 * PurchaseRepository.gs
 * Sheet access for purchase orders and purchase lines (Sprint 5).
 * No business rules; PurchaseService owns the PO lifecycle, receipt
 * posting, and landing-cost allocation.
 */

var PurchaseRepository = (function () {
  'use strict';

  var SHEET_PURCHASES = 'Purchases';
  var SHEET_PURCHASE_ITEMS = 'PurchaseItems';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_PURCHASES);
    SheetSchemaService.getSchema(SHEET_PURCHASE_ITEMS);
  }

  function findPurchaseById(purchaseId) {
    return RepositoryService.findById(SHEET_PURCHASES, purchaseId);
  }

  function getPurchase(purchaseId) {
    var record = findPurchaseById(purchaseId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function findPurchaseItemById(purchaseItemId) {
    return RepositoryService.findById(SHEET_PURCHASE_ITEMS, purchaseItemId);
  }

  function listPurchaseItems(purchaseId) {
    var records = RepositoryService.readAll(SHEET_PURCHASE_ITEMS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].purchase_id) === String(purchaseId)) {
        out.push(records[i]);
      }
    }
    out.sort(function (a, b) {
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    return out;
  }

  function getPurchaseItemsPublic(purchaseId) {
    var items = listPurchaseItems(purchaseId);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      out.push(RepositoryService.toPublicRecord(items[i]));
    }
    return out;
  }

  /**
   * Lists purchase orders with filters and pagination.
   * 'full' attaches supplier name (and line items) to each order.
   */
  function listPurchases(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_PURCHASES);
    var status = filters.status;
    var supplierId = filters.supplierId;
    var search = ClientRepository.normalizeSearch(filters.search);

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (status && String(r.status) !== String(status)) {
        continue;
      }
      if (supplierId && String(r.supplier_id) !== String(supplierId)) {
        continue;
      }
      if (search) {
        var haystack = [r.purchase_id, r.notes].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      var keyA = (a.purchase_date || '') + ':' + (a.created_at || '');
      var keyB = (b.purchase_date || '') + ':' + (b.created_at || '');
      return String(keyA).localeCompare(String(keyB));
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

  return {
    assertDatabase: assertDatabase,
    findPurchaseById: findPurchaseById,
    getPurchase: getPurchase,
    findPurchaseItemById: findPurchaseItemById,
    listPurchaseItems: listPurchaseItems,
    getPurchaseItemsPublic: getPurchaseItemsPublic,
    listPurchases: listPurchases,
    SHEET_PURCHASES: SHEET_PURCHASES,
    SHEET_PURCHASE_ITEMS: SHEET_PURCHASE_ITEMS
  };
})();