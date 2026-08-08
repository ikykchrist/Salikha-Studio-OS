/**
 * SupplierRepository.gs
 * Sheet access for suppliers (Sprint 5). No business rules here;
 * SupplierService owns validation and lifecycle.
 */

var SupplierRepository = (function () {
  'use strict';

  var SHEET_SUPPLIERS = 'Suppliers';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_SUPPLIERS);
  }

  function findSupplierById(supplierId) {
    return RepositoryService.findById(SHEET_SUPPLIERS, supplierId);
  }

  function getSupplier(supplierId) {
    var record = findSupplierById(supplierId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function findByName(name) {
    var records = RepositoryService.readAll(SHEET_SUPPLIERS);
    var needle = String(name || '').trim().toLowerCase();
    if (!needle) {
      return null;
    }
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].name || '').toLowerCase() === needle) {
        return records[i];
      }
    }
    return null;
  }

  /**
   * Lists suppliers with filters and pagination.
   */
  function listSuppliers(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_SUPPLIERS);
    var search = ClientRepository.normalizeSearch(filters.search);
    var activeOnly = !!filters.activeOnly;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (activeOnly && (String(r.is_active) === 'FALSE' || r.is_active === false)) {
        continue;
      }
      if (search) {
        var haystack = [r.name, r.contact_person, r.phone, r.email].join(' ').toLowerCase();
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
    findSupplierById: findSupplierById,
    getSupplier: getSupplier,
    findByName: findByName,
    listSuppliers: listSuppliers,
    SHEET_SUPPLIERS: SHEET_SUPPLIERS
  };
})();