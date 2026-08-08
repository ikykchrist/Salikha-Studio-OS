/**
 * DeploymentRepository.gs
 * Sheet access for the deployment domain (Sprint 6): EventDeployments
 * and the child sheets DeploymentItems, DeploymentEquipment,
 * DeploymentChecklists, DeploymentIncidents. No business rules here.
 */

var DeploymentRepository = (function () {
  'use strict';

  // Plain sheet-name strings: resolved against SheetSchemaService at
  // call time (matches BookingRepository's load-order strategy).
  var SHEET_DEPLOYMENTS = 'EventDeployments';
  var SHEET_ITEMS = 'DeploymentItems';
  var SHEET_EQUIPMENT = 'DeploymentEquipment';
  var SHEET_CHECKLISTS = 'DeploymentChecklists';
  var SHEET_INCIDENTS = 'DeploymentIncidents';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_DEPLOYMENTS);
    SheetSchemaService.getSchema(SHEET_ITEMS);
    SheetSchemaService.getSchema(SHEET_EQUIPMENT);
    SheetSchemaService.getSchema(SHEET_CHECKLISTS);
    SheetSchemaService.getSchema(SHEET_INCIDENTS);
  }

  function findDeploymentById(deploymentId) {
    return RepositoryService.findById(SHEET_DEPLOYMENTS, deploymentId);
  }

  function findDeploymentByBooking(bookingId) {
    return RepositoryService.findByField(SHEET_DEPLOYMENTS, 'booking_id', bookingId)[0] || null;
  }

  function getDeploymentPublic(deploymentId) {
    var record = findDeploymentById(deploymentId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists deployments with filters and pagination.
   */
  function listDeployments(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_DEPLOYMENTS);
    var bookingId = filters.bookingId;
    var status = filters.status;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      if (status && String(r.status) !== String(status)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
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

  /* ------------------- Deployment items (materials) ------------------- */

  function listItems(deploymentId) {
    var records = RepositoryService.findByField(SHEET_ITEMS, 'deployment_id', deploymentId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.itemName || '').localeCompare(String(b.itemName || ''));
    });
    return out;
  }

  function findItemById(deploymentItemId) {
    return RepositoryService.findById(SHEET_ITEMS, deploymentItemId);
  }

  /* ------------------- Deployment equipment ------------------- */
  function listEquipment(deploymentId) {
    var records = RepositoryService.findByField(SHEET_EQUIPMENT, 'deployment_id', deploymentId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    return out;
  }

  function findDeploymentEquipmentById(deploymentEquipId) {
    return RepositoryService.findById(SHEET_EQUIPMENT, deploymentEquipId);
  }

  /**
   * All DeploymentEquipment rows that reference one equipment unit,
   * across deployments (used to detect double-assignment).
   */
  function findEquipmentAssignments(equipmentId) {
    return RepositoryService.findByField(SHEET_EQUIPMENT, 'equipment_id', equipmentId);
  }

  /* ------------------- Checklists ------------------- */

  /**
   * Template rows: checklist items without a deployment_id. Copied into
   * each deployment at creation time (docs/DATABASE_SCHEMA.md §8.4).
   */
  function listChecklistTemplate() {
    var records = RepositoryService.readAll(SHEET_CHECKLISTS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r.deployment_id || String(r.deployment_id) === '') {
        out.push(RepositoryService.toPublicRecord(r));
      }
    }
    out.sort(function (a, b) {
      return String(a.templateId || '').localeCompare(String(b.templateId || ''));
    });
    return out;
  }

  function listChecklists(deploymentId) {
    var records = RepositoryService.findByField(SHEET_CHECKLISTS, 'deployment_id', deploymentId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.itemName || '').localeCompare(String(b.itemName || ''));
    });
    return out;
  }

  function findChecklistById(checklistItemId) {
    return RepositoryService.findById(SHEET_CHECKLISTS, checklistItemId);
  }

  /* ------------------- Incidents ------------------- */

  function listIncidents(deploymentId) {
    var records = RepositoryService.findByField(SHEET_INCIDENTS, 'deployment_id', deploymentId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return out;
  }

  function findIncidentById(incidentId) {
    return RepositoryService.findById(SHEET_INCIDENTS, incidentId);
  }

  return {
    assertDatabase: assertDatabase,
    findDeploymentById: findDeploymentById,
    findDeploymentByBooking: findDeploymentByBooking,
    getDeploymentPublic: getDeploymentPublic,
    listDeployments: listDeployments,
    listItems: listItems,
    findItemById: findItemById,
    listEquipment: listEquipment,
    findDeploymentEquipmentById: findDeploymentEquipmentById,
    findEquipmentAssignments: findEquipmentAssignments,
    listChecklistTemplate: listChecklistTemplate,
    listChecklists: listChecklists,
    findChecklistById: findChecklistById,
    listIncidents: listIncidents,
    findIncidentById: findIncidentById,
    SHEET_DEPLOYMENTS: SHEET_DEPLOYMENTS,
    SHEET_ITEMS: SHEET_ITEMS,
    SHEET_EQUIPMENT: SHEET_EQUIPMENT,
    SHEET_CHECKLISTS: SHEET_CHECKLISTS,
    SHEET_INCIDENTS: SHEET_INCIDENTS
  };
})();