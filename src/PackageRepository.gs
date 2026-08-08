/**
 * PackageRepository.gs
 * Sheet access and search for Packages, PackageItems, and PackageAddOns
 * (Sprint 2). No business decisions here.
 */

var PackageRepository = (function () {
  'use strict';

  // Plain strings: resolved against SheetSchemaService at call time
  // (Apps Script loads files alphabetically).
  var SHEET_PACKAGES = 'Packages';
  var SHEET_ITEMS = 'PackageItems';
  var SHEET_ADD_ONS = 'PackageAddOns';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    // Runtime guard: constants must match the registered schema.
    SheetSchemaService.getSchema(SHEET_PACKAGES);
    SheetSchemaService.getSchema(SHEET_ITEMS);
    SheetSchemaService.getSchema(SHEET_ADD_ONS);
  }

  function findById(packageId) {
    return RepositoryService.findById(SHEET_PACKAGES, packageId);
  }

  function getPackage(packageId) {
    var record = findById(packageId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists packages with search, filters, and pagination.
   */
  function listPackages(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_PACKAGES);
    var search = ClientRepository.normalizeSearch(filters.search);
    var serviceType = filters.serviceType;
    var activeOnly = filters.activeOnly !== false;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (activeOnly && inactive) {
        continue;
      }
      if (serviceType && String(r.service_type) !== String(serviceType)) {
        continue;
      }
      if (search) {
        var haystack = [r.package_name, r.service_type, r.description].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return Number(a.displayOrder || 0) - Number(b.displayOrder || 0) ||
        String(a.packageName || '').localeCompare(String(b.packageName || ''));
    });
    return paginate(out, filters);
  }

  function paginate(items, filters) {
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || ClientRepository.DEFAULT_PAGE_SIZE, 1), ClientRepository.MAX_PAGE_SIZE);
    var total = items.length;
    var start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  /* ------------------- Items ------------------- */

  function listItems(packageId) {
    var records = RepositoryService.findByField(SHEET_ITEMS, 'package_id', packageId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
    });
    return out;
  }

  /**
   * Sums estimated_total_cost across a package's items (raw records).
   */
  function itemsTotalCost(packageId) {
    var records = RepositoryService.findByField(SHEET_ITEMS, 'package_id', packageId);
    var total = 0;
    for (var i = 0; i < records.length; i++) {
      total += Number(records[i].estimated_total_cost || 0);
    }
    return total;
  }

  /* ------------------- Add-ons ------------------- */

  function findAddOnById(addOnId) {
    return RepositoryService.findById(SHEET_ADD_ONS, addOnId);
  }

  function getAddOn(addOnId) {
    var record = findAddOnById(addOnId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function listAddOns(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_ADD_ONS);
    var search = ClientRepository.normalizeSearch(filters.search);
    var activeOnly = filters.activeOnly !== false;
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (activeOnly && inactive) {
        continue;
      }
      if (search) {
        var haystack = [r.add_on_name, r.service_type].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(a.addOnName || '').localeCompare(String(b.addOnName || ''));
    });
    return paginate(out, filters);
  }

  return {
    assertDatabase: assertDatabase,
    findById: findById,
    getPackage: getPackage,
    listPackages: listPackages,
    listItems: listItems,
    itemsTotalCost: itemsTotalCost,
    findAddOnById: findAddOnById,
    getAddOn: getAddOn,
    listAddOns: listAddOns
  };
})();
