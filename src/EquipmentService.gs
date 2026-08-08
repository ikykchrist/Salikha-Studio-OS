/**
 * EquipmentService.gs
 * Equipment asset registry and maintenance log (Sprint 5).
 *
 * - Equipment purchases are capital assets, never operating expenses.
 * - Depreciation is straight-line, informational-only for reports; it
 *   never creates cash transactions.
 * - Maintenance/write-offs/sales happen through equipment movements
 *   (ASSIGN, RETURN, MAINTENANCE, REPAIR, SALE, WRITE_OFF).
 * - Equipment records are never physically deleted; state is tracked
 *   via status (IN_SERVICE, OUT_OF_SERVICE, SOLD, WRITTEN_OFF) and
 *   condition (GOOD, FAIR, DAMAGED, FOR_REPAIR).
 */

var EquipmentService = (function () {
  'use strict';

  var CATEGORIES = ['CAMERA', 'AUDIO', 'PRINT', 'BOOTH', 'LIGHTING', 'OTHER'];

  var COND_GOOD = 'GOOD';
  var COND_FAIR = 'FAIR';
  var COND_DAMAGED = 'DAMAGED';
  var COND_FOR_REPAIR = 'FOR_REPAIR';
  var CONDITIONS = [COND_GOOD, COND_FAIR, COND_DAMAGED, COND_FOR_REPAIR];

  var STATUS_IN_SERVICE = 'IN_SERVICE';
  var STATUS_OUT_OF_SERVICE = 'OUT_OF_SERVICE';
  var STATUS_SOLD = 'SOLD';
  var STATUS_WRITTEN_OFF = 'WRITTEN_OFF';
  var STATUSES = [STATUS_IN_SERVICE, STATUS_OUT_OF_SERVICE, STATUS_SOLD, STATUS_WRITTEN_OFF];

  var MOVEMENT_ASSIGN = 'ASSIGN';
  var MOVEMENT_RETURN = 'RETURN';
  var MOVEMENT_MAINTENANCE = 'MAINTENANCE';
  var MOVEMENT_REPAIR = 'REPAIR';
  var MOVEMENT_SALE = 'SALE';
  var MOVEMENT_WRITE = 'WRITE_OFF';
  var MOVEMENT_TYPES = [MOVEMENT_ASSIGN, MOVEMENT_RETURN, MOVEMENT_MAINTENANCE, MOVEMENT_REPAIR, MOVEMENT_SALE, MOVEMENT_WRITE];

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

  function round2(value) {
    return BookingPricingService.round2(value);
  }

  function requireEquipment(equipmentId) {
    var record = EquipmentRepository.findEquipmentById(equipmentId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.EQUIPMENT_NOT_FOUND, 'The equipment record was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  /**
   * Straight-line monthly depreciation. Informational only; never
   * triggers a cash transaction (see docs/FINANCIAL_RULES.md §11).
   */
  function monthlyDepreciation(record) {
    var price = number(record.purchase_price !== undefined ? record.purchase_price : record.purchasePrice);
    var months = number(record.useful_life_months !== undefined ? record.useful_life_months : record.usefulLifeMonths);
    if (price <= 0 || months <= 0) {
      return 0;
    }
    return round2(price / months);
  }

  /**
   * Full read model: master record + computed depreciation + movements.
   */
  function enrichEquipment(equipmentId) {
    var equipment = EquipmentRepository.getEquipment(equipmentId);
    if (!equipment) {
      return null;
    }
    equipment.depreciationValue = equipment.depreciationValue || 0;
    equipment.monthlyDepreciation = monthlyDepreciation(equipment);
    equipment.movements = EquipmentRepository.getEquipmentMovementsPublic(equipmentId);
    return equipment;
  }

  function validateEquipmentPayload(payload) {
    var name = ValidationService.trimSafe(payload.name);
    if (!name) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Equipment name is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var categoryCheck = ValidationService.isEnum(payload.category || 'OTHER', CATEGORIES, 'Category');
    if (!categoryCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, categoryCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var conditionCheck = ValidationService.isEnum(payload.condition || COND_GOOD, CONDITIONS, 'Condition');
    if (!conditionCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, conditionCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var price = number(payload.purchasePrice);
    if (price < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Purchase price cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var life = number(payload.usefulLifeMonths);
    if (life <= 0) {
      life = 36;
    }
    return {
      name: name,
      category: payload.category || 'OTHER',
      serialNumber: ValidationService.trimSafe(payload.serialNumber),
      purchaseDate: payload.purchaseDate || '',
      purchasePrice: price,
      usefulLifeMonths: life,
      condition: payload.condition || COND_GOOD,
      notes: ValidationService.trimSafe(payload.notes)
    };
  }

  function createEquipment(payload) {
    assertDatabase();
    var data = validateEquipmentPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var equipmentId = IdService.generateId('EQP');
      RepositoryService.appendRecord(EquipmentRepository.SHEET_EQUIPMENT, {
        equipment_id: equipmentId,
        name: data.name,
        category: data.category,
        serial_number: data.serialNumber,
        purchase_date: data.purchaseDate,
        purchase_price: round2(data.purchasePrice),
        useful_life_months: data.usefulLifeMonths,
        condition: data.condition,
        status: STATUS_IN_SERVICE,
        notes: data.notes,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.EQUIPMENT_CREATED, 'Equipment', equipmentId,
        'Registered equipment ' + data.name + '.');
      return enrichEquipment(equipmentId);
    }, 'equipment-create');
  }

  function updateEquipment(payload) {
    assertDatabase();
    var record = requireEquipment(payload.equipmentId);
    if (String(record.status) === STATUS_WRITTEN_OFF || String(record.status) === STATUS_SOLD) {
      throw ErrorService.create(ErrorService.CODES.EQUIPMENT_INVALID_STATUS_TRANSITION,
        'Written-off or sold equipment cannot be edited.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var data = validateEquipmentPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(EquipmentRepository.SHEET_EQUIPMENT, payload.equipmentId, {
        name: data.name,
        category: data.category,
        serial_number: data.serialNumber,
        purchase_date: data.purchaseDate,
        purchase_price: round2(data.purchasePrice),
        useful_life_months: data.usefulLifeMonths,
        condition: data.condition,
        notes: data.notes,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EQUIPMENT_UPDATED, 'Equipment', payload.equipmentId,
        'Updated equipment ' + data.name + '.');
      return enrichEquipment(payload.equipmentId);
    }, 'equipment-update');
  }

  /**
   * Records an equipment movement (ASSIGN/RETURN/MAINTENANCE/REPAIR/
   * SALE/WRITE_OFF) and updates status/condition accordingly. Never
   * creates a cash transaction (maintenance payment flows through
   * Expenses).
   */
  function recordMovement(payload) {
    assertDatabase();
    var equipmentId = payload.equipmentId;
    var record = requireEquipment(equipmentId);
    var movementType = String((payload.movementType || '').toUpperCase() || '');
    var typeCheck = ValidationService.isEnum(movementType, MOVEMENT_TYPES, 'Movement type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (movementType === MOVEMENT_WRITE && !ValidationService.trimSafe(payload.reason)) {
      throw ErrorService.create(ErrorService.CODES.EQUIPMENT_WRITE_OFF_REASON_REQUIRED,
        'A reason is required to write off equipment.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var conditionIn = payload.conditionIn ? String(payload.conditionIn).toUpperCase() : '';
    if (conditionIn && CONDITIONS.indexOf(conditionIn) === -1) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Condition-in is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var cost = number(payload.cost);
    if (cost < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.appendRecord(EquipmentRepository.SHEET_EQUIPMENT_MOVEMENTS, {
        equipment_movement_id: IdService.generateId('EQM'),
        equipment_id: equipmentId,
        deployment_id: ValidationService.trimSafe(payload.deploymentId),
        movement_type: movementType,
        condition_out: String(record.condition || ''),
        condition_in: conditionIn,
        notes: ValidationService.trimSafe(payload.reason) || ValidationService.trimSafe(payload.notes),
        cost: round2(cost),
        performed_at: now,
        performed_by: actor.userId,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });

      var patch = {
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      switch (movementType) {
        case MOVEMENT_ASSIGN:
          patch.status = STATUS_OUT_OF_SERVICE;
          break;
        case MOVEMENT_RETURN:
          patch.status = STATUS_IN_SERVICE;
          if (conditionIn) {
            patch.condition = conditionIn;
          }
          break;
        case MOVEMENT_MAINTENANCE:
        case MOVEMENT_REPAIR:
          patch.status = STATUS_IN_SERVICE;
          patch.condition = conditionIn || COND_GOOD;
          break;
        case MOVEMENT_SALE:
          patch.status = STATUS_SOLD;
          break;
        case MOVEMENT_WRITE:
          patch.status = STATUS_WRITTEN_OFF;
          patch.condition = conditionIn || COND_DAMAGED;
          break;
        default:
          break;
      }
      RepositoryService.updateById(EquipmentRepository.SHEET_EQUIPMENT, equipmentId, patch);
      AuditService.info(AuditService.ACTIONS.EQUIPMENT_MOVEMENT_RECORDED, 'Equipment', equipmentId,
        'Movement ' + movementType + ' on ' + record.name + '.');
      return enrichEquipment(equipmentId);
    }, 'equipment-movement');
  }

  function setStatus(equipmentId, status, reason) {
    assertDatabase();
    var record = requireEquipment(equipmentId);
    if (STATUSES.indexOf(status) === -1) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Equipment status is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (status === STATUS_WRITTEN_OFF && !ValidationService.trimSafe(reason)) {
      throw ErrorService.create(ErrorService.CODES.EQUIPMENT_WRITE_OFF_REASON_REQUIRED,
        'A reason is required to write off equipment.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(EquipmentRepository.SHEET_EQUIPMENT, equipmentId, {
        status: status,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EQUIPMENT_STATUS_CHANGED, 'Equipment', equipmentId,
        'Set equipment ' + record.name + ' status to ' + status + '.');
      return enrichEquipment(equipmentId);
    }, 'equipment-status');
  }

  function getEquipment(equipmentId) {
    assertDatabase();
    requireEquipment(equipmentId);
    return enrichEquipment(equipmentId);
  }

  function listEquipments(filters) {
    assertDatabase();
    return EquipmentRepository.listEquipment(filters);
  }

  return {
    getEquipment: getEquipment,
    listEquipments: listEquipments,
    createEquipment: createEquipment,
    updateEquipment: updateEquipment,
    recordMovement: recordMovement,
    setStatus: setStatus,
    monthlyDepreciation: monthlyDepreciation,
    enrichEquipment: enrichEquipment,
    CATEGORIES: CATEGORIES,
    CONDITIONS: CONDITIONS,
    STATUSES: STATUSES,
    MOVEMENT_TYPES: MOVEMENT_TYPES,
    MOVEMENT_SALE: MOVEMENT_SALE,
    MOVEMENT_WRITE: MOVEMENT_WRITE,
    STATUS_IN_SERVICE: STATUS_IN_SERVICE,
    STATUS_OUT_OF_SERVICE: STATUS_OUT_OF_SERVICE,
    STATUS_SOLD: STATUS_SOLD,
    STATUS_WRITTEN_OFF: STATUS_WRITTEN_OFF
  };
})();