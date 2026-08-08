/**
 * DeploymentService.gs
 * Event deployments (Sprint 6, WF-4/WF-5).
 *
 * One deployment per booking (1:1), auto-created by ProductionService
 * when the required production tasks complete. Lifecycle:
 *   PLANNED -> LOADING -> IN_PROGRESS -> RETURNED -> RECONCILED -> CLOSED
 *
 * Reconciliation is the financial trigger: it posts inventory
 * STOCK_USAGE / STOCK_RETURN movements, computes the actual material
 * cost for the booking, and updates BookingCosts. Reconciled
 * deployments are immutable; corrections use inventory adjustments.
 *
 * Deployment items/equipment/checklists/incidents are editor-owned
 * rows that feed operations and costs; they never mint cash.
 */

var DeploymentService = (function () {
  'use strict';

  var STATUS_PLANNED = 'PLANNED';
  var STATUS_LOADING = 'LOADING';
  var STATUS_IN_PROGRESS = 'IN_PROGRESS';
  var STATUS_RETURNED = 'RETURNED';
  var STATUS_RECONCILED = 'RECONCILED';
  var STATUS_CLOSED = 'CLOSED';
  var STATUSES = [STATUS_PLANNED, STATUS_LOADING, STATUS_IN_PROGRESS, STATUS_RETURNED, STATUS_RECONCILED, STATUS_CLOSED];

  var SEVERITY_LOW = 'LOW';
  var SEVERITY_MEDIUM = 'MEDIUM';
  var SEVERITY_HIGH = 'HIGH';
  var SEVERITY_CRITICAL = 'CRITICAL';
  var SEVERITIES = [SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL];

  function assertDatabase() {
    DeploymentRepository.assertDatabase();
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function round2(value) {
    return BookingPricingService.round2(value);
  }

  function roundQty(value) {
    return InventoryValuationService.roundQty(value);
  }

  function requireDeployment(deploymentId) {
    var record = DeploymentRepository.findDeploymentById(deploymentId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_NOT_FOUND,
        'The deployment was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  function requireBooking(bookingId) {
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return booking;
  }

  /**
   * Asserts the deployment is currently at the expected status. */
  function assertStatus(record, expected) {
    var current = String(record.status || '');
    if (current !== expected) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_INVALID_STATUS_TRANSITION,
        'Deployment must be ' + expected + ' to perform this action (current: ' + current + ').',
        { current: current, expected: expected },
        ErrorService.CATEGORY_CONFLICT
      );
    }
  }

  function requireMutable(record) {
    var status = String(record.status || '');
    if (status === STATUS_RECONCILED || status === STATUS_CLOSED) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_EDIT_BLOCKED,
        'Reconciled deployments are immutable. Correct quantities with an inventory adjustment.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
  }

  /* ------------------- Core: create + read ------------------- */

  /**
   * Creates the single PLANNED deployment for a booking. Fails if the
   * booking already has one (1:1 contract).
   */
  function createDeployment(bookingId, opts) {
    assertDatabase();
    requireBooking(bookingId);
    opts = opts || {};
    if (DeploymentRepository.findDeploymentByBooking(bookingId)) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_ALREADY_EXISTS,
        'This booking already has a deployment. A booking maps to exactly one deployment.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var deploymentId = IdService.generateId('DEP');
      RepositoryService.appendRecord(DeploymentRepository.SHEET_DEPLOYMENTS, {
        deployment_id: deploymentId,
        booking_id: bookingId,
        status: STATUS_PLANNED,
        scheduled_date: opts.scheduledDate || '',
        actual_material_cost: 0,
        actual_booking_cost: 0,
        started_at: '',
        started_by: '',
        returned_at: '',
        returned_by: '',
        reconciled_at: '',
        reconciled_by: '',
        closed_at: '',
        closed_by: '',
        checklist_source: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      copyChecklistTemplate(deploymentId, actor, now);
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_CREATED, 'EventDeployments', deploymentId,
        'Deployment created for booking ' + bookingId + '.');
      return getDeployment(deploymentId);
    }, 'deployment-create');
  }

  /**
   * Copies template checklist rows (deployment_id empty) into the
   * deployment's own checklist.
   */
  function copyChecklistTemplate(deploymentId, actor, now) {
    var template = DeploymentRepository.listChecklistTemplate();
    for (var i = 0; i < template.length; i++) {
      var row = template[i];
      RepositoryService.appendRecord(DeploymentRepository.SHEET_CHECKLISTS, {
        checklist_item_id: IdService.generateId('DCL'),
        deployment_id: deploymentId,
        template_id: row.templateId,
        item_name: row.itemName,
        is_required: String(row.isRequired) === 'TRUE' || row.isRequired === true ? 'TRUE' : 'FALSE',
        is_done: 'FALSE',
        done_by: '',
        done_at: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
    }
  }

  function enrich(deploymentId, record) {
    var d = RepositoryService.toPublicRecord(record);
    d.items = DeploymentRepository.listItems(deploymentId);
    d.equipment = DeploymentRepository.listEquipment(deploymentId);
    d.checklist = DeploymentRepository.listChecklists(deploymentId);
    d.incidents = DeploymentRepository.listIncidents(deploymentId);
    return d;
  }

  function findDeploymentByBooking(bookingId) {
    assertDatabase();
    var record = DeploymentRepository.findDeploymentByBooking(bookingId);
    if (!record) {
      return null;
    }
    return enrich(record.deployment_id, record);
  }

  function getDeployment(deploymentId) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    return enrich(deploymentId, record);
  }

  function listDeployments(filters) {
    assertDatabase();
    return DeploymentRepository.listDeployments(filters || {});
  }

  /* ------------------- Lifecycle transitions ------------------- */

  function startLoading(deploymentId) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    assertStatus(record, STATUS_PLANNED);
    requireMutable(record);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(DeploymentRepository.SHEET_DEPLOYMENTS, deploymentId, {
        status: STATUS_LOADING,
        started_at: now,
        started_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_LOADING, 'EventDeployments', deploymentId,
        'Loading started.');
      return getDeployment(deploymentId);
    }, 'deployment-loading');
  }

  function depart(deploymentId) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    assertStatus(record, STATUS_LOADING);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(DeploymentRepository.SHEET_DEPLOYMENTS, deploymentId, {
        status: STATUS_IN_PROGRESS,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_DEPARTED, 'EventDeployments', deploymentId,
        'Deployment departed for the event.');
      return getDeployment(deploymentId);
    }, 'deployment-depart');
  }

  /**
   * Return from the event. Captures returned quantities (returned_qty
   * edited here and during RETURNED) and locks the deck.
   */
  function markReturned(deploymentId, payload) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    assertStatus(record, STATUS_IN_PROGRESS);
    payload = payload || {};
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      if (payload.returnedQuantities) {
        for (var i = 0; i < payload.returnedQuantities.length; i++) {
          var entry = payload.returnedQuantities[i];
          updateItemReturnedQty(deploymentId, entry.deploymentItemId || entry.deployment_item_id,
            entry.returnedQty !== undefined ? entry.returnedQty : entry.returned_qty, actor, now);
        }
      }
      RepositoryService.updateById(DeploymentRepository.SHEET_DEPLOYMENTS, deploymentId, {
        status: STATUS_RETURNED,
        returned_at: now,
        returned_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_RETURNED, 'EventDeployments', deploymentId,
        'Deployment returned.');
      return getDeployment(deploymentId);
    }, 'deployment-return');
  }

  function updateItemReturnedQty(deploymentId, depItemId, returnedQty, actor, now) {
    var item = DeploymentRepository.findItemById(depItemId);
    if (!item || String(item.deployment_id) !== String(deploymentId)) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_ITEM_NOT_FOUND,
        'The deployment item was not found on this deployment.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var loaded = roundQty(number(item.loaded_qty));
    var returned = roundQty(number(returnedQty));
    if (returned < 0 || returned > loaded) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_RETURN_QTY_INVALID,
        'Returned quantity must be between 0 and loaded (' + loaded + ').', null, ErrorService.CATEGORY_VALIDATION);
    }
    RepositoryService.updateById(DeploymentRepository.SHEET_ITEMS, depItemId, {
      returned_qty: returned,
      updated_at: now,
      updated_by: actor.userId,
      version: Number(item.version || 1) + 1
    });
  }

  /**
   * Reconciliation: validate gates, post inventory, compute material
   * cost, update BookingCosts. Atomic under one lock. Idempotency:
   * a deployment must be RETURNED; after RECONCILED it never posts a
   * second time (see DEPLOYMENT_EDIT_BLOCKED on mutable checks).
   */
  function reconcileDeployment(deploymentId) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    assertStatus(record, STATUS_RETURNED);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      validateChecklistComplete(deploymentId);
      validateCrewSignoff(deploymentId);

      var items = DeploymentRepository.listItems(deploymentId);
      var materialCost = 0;
      for (var i = 0; i < items.length; i++) {
        var depItem = items[i];
        var itemId = depItem.itemId || depItem.item_id;
        if (!itemId) {
          continue;
        }
        var loaded = roundQty(number(depItem.loadedQty !== undefined ? depItem.loadedQty : depItem.loaded_qty));
        var returned = roundQty(number(depItem.returnedQty !== undefined ? depItem.returnedQty : depItem.returned_qty));
        var consumed = Math.max(0, loaded - returned);
        var unitCost = round2(number(depItem.unitCost !== undefined ? depItem.unitCost : depItem.unit_cost));

        if (consumed > 0) {
          var usage = InventoryMovementService.recordUsage({
            itemId: itemId,
            quantity: consumed,
            movementType: InventoryMovementService.TYPE_USAGE,
            source: InventoryMovementService.SOURCE_DEPLOYMENT,
            sourceRefId: deploymentId,
            reason: 'Consumed at event ' + deploymentId
          });
          unitCost = consumed > 0 ? round2(usage.actualValue / consumed) : 0;
        }
        if (returned > 0) {
          InventoryMovementService.recordStockReturn({
            itemId: itemId,
            quantity: returned,
            source: InventoryMovementService.SOURCE_DEPLOYMENT,
            sourceRefId: deploymentId,
            reason: 'Unused stock returned from event ' + deploymentId
          });
        }
        var lineCost = round2(consumed * unitCost);
        materialCost = round2(materialCost + lineCost);
        RepositoryService.updateById(DeploymentRepository.SHEET_ITEMS, depItem.deploymentItemId || depItem.deployment_item_id, {
          consumed_qty: consumed,
          unit_cost: unitCost,
          cost: consumed > 0 ? lineCost : 0,
          updated_at: now,
          updated_by: actor.userId,
          version: Number(depItem.version || 1) + 1
        });
      }

      RepositoryService.updateById(DeploymentRepository.SHEET_DEPLOYMENTS, deploymentId, {
        status: STATUS_RECONCILED,
        actual_material_cost: materialCost,
        actual_booking_cost: materialCost,
        reconciled_at: now,
        reconciled_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });

      BookingProfitService.applyDeploymentMaterialCost(record.booking_id, materialCost);

      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_RECONCILED, 'EventDeployments', deploymentId,
        'Deployment reconciled. Actual material cost ' + materialCost.toFixed(2) + '.');
      return getDeployment(deploymentId);
    });
  }

  function validateChecklistComplete(deploymentId) {
    var checklist = DeploymentRepository.listChecklists(deploymentId);
    for (var i = 0; i < checklist.length; i++) {
      var c = checklist[i];
      var required = String(c.isRequired) === 'TRUE' || c.isRequired === true;
      var done = String(c.isDone) === 'TRUE' || c.isDone === true;
      if (required && !done) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_CHECKLIST_INCOMPLETE,
          'Cannot reconcile: required checklist item "' + c.itemName + '" is not done.', null, ErrorService.CATEGORY_CONFLICT);
      }
    }
  }

  function validateCrewSignoff(deploymentId) {
    var assignments = CrewRepository.listAssignmentsByDeployment(deploymentId);
    for (var i = 0; i < assignments.length; i++) {
      var a = assignments[i];
      var signedOff = String(a.signedOff !== undefined ? a.signedOff : a.signed_off) === 'TRUE' || a.signedOff === true || a.signed_off === true;
      if (!signedOff) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_SIGNOFF_REQUIRED,
          'Cannot reconcile: crew assignment ' + (a.crewAssignId || a.crew_assign_id) + ' has not signed off.', null, ErrorService.CATEGORY_CONFLICT);
      }
    }
  }

  /* ------------------- Deployment items ------------------- */

  function addDeploymentItem(deploymentId, payload) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    requireMutable(record);
    var status = String(record.status || '');
    if (status !== STATUS_PLANNED && status !== STATUS_LOADING) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_ITEM_EDIT_BLOCKED,
        'Materials can only be added while PLANNED/LOADING.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var itemId = ValidationService.trimSafe(payload.itemId);
    if (!itemId) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'An inventory item is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var itemRecord = InventoryRepository.findItemById(itemId);
    if (!itemRecord) {
      throw ErrorService.create(ErrorService.CODES.ITEM_NOT_FOUND, 'The inventory item was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var existing = DeploymentRepository.listItems(deploymentId);
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i].itemId || existing[i].item_id) === String(itemId)) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_ITEM_CONFLICT,
          'This item is already listed on the deployment.', null, ErrorService.CATEGORY_CONFLICT);
      }
    }
    var projected = roundQty(number(payload.projectedQty));
    var loaded = roundQty(payload.loadedQty !== undefined ? number(payload.loadedQty) : projected);
    if (projected < 0 || loaded < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Quantities cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var batches = InventoryRepository.listBatches(itemId);
    var unitCost = round2(InventoryValuationService.weightedAverageUnitCost(batches) || 0);

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var available = InventoryMovementService.currentOnHand(itemId);
      if (loaded > available) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY,
          'Loaded quantity ' + loaded + ' exceeds available on hand (' + available + ') for "' +
            (itemRecord.name || itemId) + '".',
          { available: available, requested: loaded }, ErrorService.CATEGORY_CONFLICT);
      }
      var depItemId = IdService.generateId('DPM');
      RepositoryService.appendRecord(DeploymentRepository.SHEET_ITEMS, {
        deployment_item_id: depItemId,
        deployment_id: deploymentId,
        item_id: itemId,
        item_name: itemRecord.name || '',
        projected_qty: projected,
        loaded_qty: loaded,
        returned_qty: 0,
        consumed_qty: 0,
        unit_cost: unitCost,
        wastage_reason: '',
        cost: 0,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_ITEM_ADDED, 'DeploymentItems', depItemId,
        'Material ' + (itemRecord.name || itemId) + ' added to deployment ' + deploymentId + '.');
      return getDeployment(deploymentId);
    }, 'deployment-item-add');
  }

  /**
   * Updates material row quantities (projected/loaded/wastage) while
   * PLANNED/LOADING. LOADING is the last editable window.
   */
  function updateDeploymentItem(deploymentId, payload) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    requireMutable(record);
    var status = String(record.status || '');
    if (status !== STATUS_PLANNED && status !== STATUS_LOADING) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EDIT_BLOCKED,
        'Materials can only be edited while PLANNED/LOADING.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var depItemId = payload.deploymentItemId || payload.deployment_item_id;
    var item = DeploymentRepository.findItemById(depItemId);
    if (!item || String(item.deployment_id) !== String(deploymentId)) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_ITEM_NOT_FOUND,
        'The deployment item was not found on this deployment.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var patch = { updated_at: now, updated_by: actor.userId, version: Number(item.version || 1) + 1 };
      if (payload.projectedQty !== undefined) {
        var newProjected = roundQty(number(payload.projectedQty));
        if (newProjected < 0) {
          throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
            'Quantities cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
        }
        patch.projected_qty = newProjected;
      }
      if (payload.loadedQty !== undefined) {
        var newLoaded = roundQty(number(payload.loadedQty));
        if (newLoaded < 0) {
          throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
            'Quantities cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
        }
        var available = InventoryMovementService.currentOnHand(item.item_id);
        if (newLoaded > available) {
          throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY,
            'Loaded quantity ' + newLoaded + ' exceeds available on hand (' + available + ').',
            { available: available, requested: newLoaded }, ErrorService.CATEGORY_CONFLICT);
        }
        patch.loaded_qty = newLoaded;
      }
      if (payload.wastageReason !== undefined) {
        patch.wastage_reason = ValidationService.trimSafe(payload.wastageReason);
      }
      RepositoryService.updateById(DeploymentRepository.SHEET_ITEMS, depItemId, patch);
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_ITEM_UPDATED, 'DeploymentItems', depItemId,
        'Material updated on deployment ' + deploymentId + '.');
      return getDeployment(deploymentId);
    }, 'deployment-item-update');
  }

  /* ------------------- Deployment equipment ------------------- */

  function addDeploymentEquipment(deploymentId, payload) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    requireMutable(record);
    var status = String(record.status || '');
    if (status !== STATUS_PLANNED && status !== STATUS_LOADING) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EDIT_BLOCKED,
        'Equipment can only be added while PLANNED/LOADING.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var equipmentId = ValidationService.trimSafe(payload.equipmentId);
    if (!equipmentId) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Equipment is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var equipmentRecord = EquipmentRepository.findEquipmentById(equipmentId);
    if (!equipmentRecord) {
      throw ErrorService.create(ErrorService.CODES.EQUIPMENT_NOT_FOUND, 'The equipment was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var equipmentStatus = String(equipmentRecord.status || '');
    if (equipmentStatus !== EquipmentService.STATUS_IN_SERVICE) {
      throw ErrorService.create(ErrorService.CODES.EQUIPMENT_INVALID_STATUS_TRANSITION,
        'Only equipment in service can be assigned to a deployment (current status: ' + equipmentStatus + ').',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    var assignments = DeploymentRepository.findEquipmentAssignments(equipmentId);
    for (var a = 0; a < assignments.length; a++) {
      var otherDeploymentId = String(assignments[a].deployment_id || assignments[a].deploymentId || '');
      if (!otherDeploymentId || otherDeploymentId === String(deploymentId)) {
        continue;
      }
      var other = DeploymentRepository.findDeploymentById(otherDeploymentId);
      if (!other) {
        continue;
      }
      var otherStatus = String(other.status || '');
      if (otherStatus !== STATUS_RECONCILED && otherStatus !== STATUS_CLOSED) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EQUIPMENT_ASSIGNED,
          'This equipment is already assigned to deployment ' + otherDeploymentId + ' (' + otherStatus + ').',
          { activeDeploymentId: otherDeploymentId }, ErrorService.CATEGORY_CONFLICT);
      }
    }
    var existing = DeploymentRepository.listEquipment(deploymentId);
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i].equipmentId || existing[i].equipment_id) === String(equipmentId)) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_ITEM_CONFLICT,
          'This equipment is already assigned to the deployment.', null, ErrorService.CATEGORY_CONFLICT);
      }
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.appendRecord(DeploymentRepository.SHEET_EQUIPMENT, {
        deployment_equip_id: IdService.generateId('DEQ'),
        deployment_id: deploymentId,
        equipment_id: equipmentId,
        condition_out: ValidationService.trimSafe(payload.conditionOut) || 'GOOD',
        condition_in: '',
        notes: ValidationService.trimSafe(payload.notes),
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_EQUIPMENT_ADDED, 'DeploymentEquipment', deploymentId,
        'Equipment ' + (equipmentRecord.name || equipmentId) + ' assigned.');
      return getDeployment(deploymentId);
    }, 'deployment-equipment-add');
  }

  /* ------------------- Equipment return + close ------------------- */

  /**
   * Records the return of one equipment unit after the event (WF-5).
   * Captures the return condition on the DeploymentEquipment row, posts
   * a RETURN movement to the equipment registry (status back to
   * IN_SERVICE), and rejects double returns.
   */
  function returnDeploymentEquipment(deploymentId, payload) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    var status = String(record.status || '');
    if (status !== STATUS_IN_PROGRESS && status !== STATUS_RETURNED) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_INVALID_STATUS_TRANSITION,
        'Equipment can only be returned while IN_PROGRESS or RETURNED (current: ' + status + ').',
        { current: status }, ErrorService.CATEGORY_CONFLICT
      );
    }
    var depEquipId = ValidationService.trimSafe(payload && (payload.deploymentEquipId || payload.deployment_equip_id));
    if (!depEquipId) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EQUIPMENT_NOT_FOUND,
        'The deployment equipment row is required.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var row = DeploymentRepository.findDeploymentEquipmentById(depEquipId);
    if (!row || String(row.deployment_id || '') !== String(deploymentId)) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EQUIPMENT_NOT_FOUND,
        'The equipment row was not found on this deployment.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (row.condition_in && String(row.condition_in) !== '') {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_EQUIPMENT_ALREADY_RETURNED,
        'This equipment has already been returned.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var conditionIn = String(payload.conditionIn || 'GOOD').toUpperCase();
    if (EquipmentService.CONDITIONS.indexOf(conditionIn) === -1) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Condition-in is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var notes = ValidationService.trimSafe(payload.notes);
      RepositoryService.updateById(DeploymentRepository.SHEET_EQUIPMENT, depEquipId, {
        condition_in: conditionIn,
        notes: notes ? notes : String(row.notes || ''),
        updated_at: now,
        updated_by: actor.userId
      });
      EquipmentService.recordMovement({
        equipmentId: row.equipment_id,
        movementType: 'RETURN',
        deploymentId: deploymentId,
        conditionIn: conditionIn,
        notes: notes || 'Returned from deployment ' + deploymentId
      });
      return getDeployment(deploymentId);
    }, 'deployment-equipment-return');
  }

  /**
   * Final step of WF-5: RECONCILED -> CLOSED. Requires the deployment to
   * be reconciled first; refuses double closes.
   */
  function closeDeployment(deploymentId) {
    assertDatabase();
    var record = requireDeployment(deploymentId);
    var status = String(record.status || '');
    if (status === STATUS_CLOSED) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_CLOSED,
        'This deployment is already closed.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    if (status !== STATUS_RECONCILED) {
      throw ErrorService.create(
        ErrorService.CODES.DEPLOYMENT_NOT_RECONCILED_CANNOT_CLOSE,
        'A deployment must be RECONCILED before it can be closed (current: ' + status + ').',
        { current: status },
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(DeploymentRepository.SHEET_DEPLOYMENTS, deploymentId, {
        status: STATUS_CLOSED,
        closed_at: now,
        closed_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_CLOSED, 'EventDeployments', deploymentId,
        'Deployment closed.');
      return getDeployment(deploymentId);
    }, 'deployment-close');
  }

  /* ------------------- Checklists ------------------- */

  function setChecklistItemDone(checklistItemId, done) {
    assertDatabase();
    var item = DeploymentRepository.findChecklistById(checklistItemId);
    if (!item) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_CHECKLIST_ITEM_NOT_FOUND,
        'The checklist item was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var deploymentId = String(item.deployment_id || '');
    var deployment = requireDeployment(deploymentId);
    requireMutable(deployment);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(DeploymentRepository.SHEET_CHECKLISTS, checklistItemId, {
        is_done: done ? 'TRUE' : 'FALSE',
        done_by: done ? actor.userId : '',
        done_at: done ? now : '',
        updated_at: now,
        updated_by: actor.userId
      });
      AuditService.info(checklistItemId ? AuditService.ACTIONS.DEPLOYMENT_CHECKLIST_ITEM_DONE : AuditService.ACTIONS.DEPLOYMENT_CHECKLIST_ITEM_ADDED, 'DeploymentChecklists', checklistItemId || '',
        'Checklist item "' + item.item_name + '" ' + (done ? 'done' : 'reopened') + '.');
      return getDeployment(deploymentId);
    }, 'deployment-checklist');
  }

  function addChecklistItem(deploymentId, payload) {
    assertDatabase();
    requireDeployment(deploymentId);
    var itemName = ValidationService.trimSafe(payload.itemName);
    if (!itemName) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Checklist item name is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.appendRecord(DeploymentRepository.SHEET_CHECKLISTS, {
        checklist_item_id: IdService.generateId('DCL'),
        deployment_id: deploymentId,
        template_id: '',
        item_name: itemName,
        is_required: payload.isRequired ? 'TRUE' : 'FALSE',
        is_done: 'FALSE',
        done_by: '',
        done_at: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_CHECKLIST_ITEM_ADDED, 'DeploymentChecklists', '',
        'Checklist item "' + itemName + '" added to deployment ' + deploymentId + '.');
      return getDeployment(deploymentId);
    }, 'deployment-checklist-add');
  }

  /* ------------------- Incidents ------------------- */

  function logIncident(deploymentId, payload) {
    assertDatabase();
    requireDeployment(deploymentId);
    payload = payload || {};
    var severity = String(payload.severity || '').toUpperCase();
    var severityCheck = ValidationService.isEnum(severity, SEVERITIES, 'Severity');
    if (!severityCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, severityCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var title = ValidationService.trimSafe(payload.title);
    if (!title) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A title is required for an incident.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var incidentId = IdService.generateId('DPI');
      RepositoryService.appendRecord(DeploymentRepository.SHEET_INCIDENTS, {
        incident_id: incidentId,
        deployment_id: deploymentId,
        severity: severity,
        title: title,
        description: ValidationService.trimSafe(payload.description),
        action_taken: ValidationService.trimSafe(payload.actionTaken),
        reported_by: actor.userId,
        resolved: 'FALSE',
        resolved_at: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_INCIDENT_LOGGED, 'DeploymentIncidents', incidentId,
        'Incident [' + severity + '] ' + title + ' logged.');
      return getDeployment(deploymentId);
    }, 'deployment-incident');
  }

  function resolveIncident(incidentId) {
    assertDatabase();
    var incident = DeploymentRepository.findIncidentById(incidentId);
    if (!incident) {
      throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_INCIDENT_NOT_FOUND,
        'The incident was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(DeploymentRepository.SHEET_INCIDENTS, incidentId, {
        resolved: 'TRUE',
        resolved_at: now,
        updated_at: now,
        updated_by: actor.userId
      });
      AuditService.info(AuditService.ACTIONS.DEPLOYMENT_INCIDENT_RESOLVED, 'DeploymentIncidents', incidentId,
        'Incident resolved.');
      return getDeployment(String(incident.deployment_id || ''));
    }, 'deployment-incident-resolve');
  }

  return {
    get: getDeployment,
    getDeployment: getDeployment,
    findDeploymentByBooking: findDeploymentByBooking,
    listDeployments: listDeployments,
    createDeployment: createDeployment,
    startLoading: startLoading,
    depart: depart,
    markReturned: markReturned,
    reconcileDeployment: reconcileDeployment,
    addDeploymentItem: addDeploymentItem,
    updateDeploymentItem: updateDeploymentItem,
    addDeploymentEquipment: addDeploymentEquipment,
    returnDeploymentEquipment: returnDeploymentEquipment,
    closeDeployment: closeDeployment,
    setChecklistItemDone: setChecklistItemDone,
    addChecklistItem: addChecklistItem,
    logIncident: logIncident,
    resolveIncident: resolveIncident,
    copyChecklistTemplate: copyChecklistTemplate,
    STATUSES: STATUSES,
    SEVERITIES: SEVERITIES,
    STATUS_PLANNED: STATUS_PLANNED,
    STATUS_LOADING: STATUS_LOADING,
    STATUS_IN_PROGRESS: STATUS_IN_PROGRESS,
    STATUS_RETURNED: STATUS_RETURNED,
    STATUS_RECONCILED: STATUS_RECONCILED,
    STATUS_CLOSED: STATUS_CLOSED,
    SEVERITY_LOW: SEVERITY_LOW,
    SEVERITY_MEDIUM: SEVERITY_MEDIUM,
    SEVERITY_HIGH: SEVERITY_HIGH,
    SEVERITY_CRITICAL: SEVERITY_CRITICAL
  };
})();