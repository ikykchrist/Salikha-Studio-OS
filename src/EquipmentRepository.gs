/**
 * EquipmentRepository.gs
 * Sheet access for equipment assets and equipment movements (Sprint 5).
 * No business rules; EquipmentService owns lifecycle and depreciation.
 */

var EquipmentRepository = (function () {
  'use strict';

  var SHEET_EQUIPMENT = 'Equipment';
  var SHEET_EQUIPMENT_MOVEMENTS = 'EquipmentMovements';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_EQUIPMENT);
    SheetSchemaService.getSchema(SHEET_EQUIPMENT_MOVEMENTS);
  }

  function findEquipmentById(equipmentId) {
    return RepositoryService.findById(SHEET_EQUIPMENT, equipmentId);
  }

  function getEquipment(equipmentId) {
    var record = findEquipmentById(equipmentId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function listEquipmentMovements(equipmentId) {
    var records = RepositoryService.readAll(SHEET_EQUIPMENT_MOVEMENTS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].equipment_id) === String(equipmentId)) {
        out.push(records[i]);
      }
    }
    out.sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return out;
  }

  function getEquipmentMovementsPublic(equipmentId) {
    var items = listEquipmentMovements(equipmentId);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      out.push(RepositoryService.toPublicRecord(items[i]));
    }
    return out;
  }

  /**
   * Lists equipment with filters and pagination.
   */
  function listEquipment(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_EQUIPMENT);
    var search = ClientRepository.normalizeSearch(filters.search);
    var status = filters.status;
    var category = filters.category;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (status && String(r.status) !== String(status)) {
        continue;
      }
      if (category && String(r.category) !== String(category)) {
        continue;
      }
      if (search) {
        var haystack = [r.name, r.serial_number, r.category].join(' ').toLowerCase();
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

  return {
    assertDatabase: assertDatabase,
    findEquipmentById: findEquipmentById,
    getEquipment: getEquipment,
    listEquipmentMovements: listEquipmentMovements,
    getEquipmentMovementsPublic: getEquipmentMovementsPublic,
    listEquipment: listEquipment,
    SHEET_EQUIPMENT: SHEET_EQUIPMENT,
    SHEET_EQUIPMENT_MOVEMENTS: SHEET_EQUIPMENT_MOVEMENTS
  };
})();