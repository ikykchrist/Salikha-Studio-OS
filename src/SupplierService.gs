/**
 * SupplierService.gs
 * Supplier master data (Sprint 5): CRUD, deactivate/reactivate, and
 * validation. Suppliers are master-data records; the purchase order
 * module (PurchaseService) references them and enforces that purchases
 * only reference active suppliers.
 */

var SupplierService = (function () {
  'use strict';

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

  function requireSupplier(supplierId) {
    var record = SupplierRepository.findSupplierById(supplierId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.SUPPLIER_NOT_FOUND, 'The supplier was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function getSupplier(supplierId) {
    assertDatabase();
    var record = requireSupplier(supplierId);
    return RepositoryService.toPublicRecord(record);
  }

  function validateSupplierPayload(payload) {
    var name = ValidationService.trimSafe(payload.name);
    if (!name) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Supplier name is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var termsDays = number(payload.paymentTermsDays);
    if (termsDays < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Payment terms days cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return {
      name: name,
      contactPerson: ValidationService.trimSafe(payload.contactPerson),
      phone: ValidationService.trimSafe(payload.phone),
      email: ValidationService.trimSafe(payload.email),
      address: ValidationService.trimSafe(payload.address),
      paymentTermsDays: termsDays,
      notes: ValidationService.trimSafe(payload.notes)
    };
  }

  /**
   * Name uniqueness for active suppliers. Allows re-creating a
   * previously deactivated supplier (soft re-activation path handled
   * by reactivateSupplier).
   */
  function findActiveByName(name) {
    var record = SupplierRepository.findByName(name);
    if (record && (String(record.is_active) !== 'FALSE' && record.is_active !== false)) {
      return record;
    }
    return null;
  }

  function createSupplier(payload) {
    assertDatabase();
    var data = validateSupplierPayload(payload);
    var existing = findActiveByName(data.name);
    if (existing) {
      throw ErrorService.create(ErrorService.CODES.SUPPLIER_NAME_CONFLICT,
        'An active supplier with this name already exists.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var supplierId = IdService.generateId('SUP');
      RepositoryService.appendRecord(SupplierRepository.SHEET_SUPPLIERS, {
        supplier_id: supplierId,
        name: data.name,
        contact_person: data.contactPerson,
        phone: data.phone,
        email: data.email,
        address: data.address,
        payment_terms_days: data.paymentTermsDays,
        is_active: 'TRUE',
        notes: data.notes,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.SUPPLIER_CREATED, 'Suppliers', supplierId,
        'Created supplier ' + data.name + '.');
      return RepositoryService.toPublicRecord(
        RepositoryService.findById(SupplierRepository.SHEET_SUPPLIERS, supplierId));
    }, 'supplier-create');
  }

  function updateSupplier(payload) {
    assertDatabase();
    var record = requireSupplier(payload.supplierId);
    if (String(record.is_active) === 'FALSE' || record.is_active === false) {
      throw ErrorService.create(ErrorService.CODES.SUPPLIER_INACTIVE, 'Inactive suppliers cannot be edited.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var data = validateSupplierPayload(payload);
    var existing = SupplierRepository.findByName(data.name);
    if (existing && String(existing.supplier_id) !== String(payload.supplierId) &&
      (String(existing.is_active) !== 'FALSE' && existing.is_active !== false)) {
      throw ErrorService.create(ErrorService.CODES.SUPPLIER_NAME_CONFLICT,
        'An active supplier with this name already exists.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(SupplierRepository.SHEET_SUPPLIERS, payload.supplierId, {
        name: data.name,
        contact_person: data.contactPerson,
        phone: data.phone,
        email: data.email,
        address: data.address,
        payment_terms_days: data.paymentTermsDays,
        notes: data.notes,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.SUPPLIER_UPDATED, 'Suppliers', payload.supplierId,
        'Updated supplier ' + data.name + '.');
      return SupplierRepository.getSupplier(payload.supplierId);
    }, 'supplier-update');
  }

  function setActive(supplierId, active, reason) {
    assertDatabase();
    var record = requireSupplier(supplierId);
    var currentlyActive = String(record.is_active) !== 'FALSE' && record.is_active !== false;
    if (currentlyActive === active) {
      throw ErrorService.create(ErrorService.CODES.CONFLICT,
        active ? 'The supplier is already active.' : 'The supplier is already inactive.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    if (!active) {
      var purchases = RepositoryService.findByField(SheetSchemaService.SHEET_PURCHASES, 'supplier_id', supplierId);
      for (var i = 0; i < purchases.length; i++) {
        var status = String(purchases[i].status || '');
        if (status === 'ORDERED' || status === 'PARTIALLY_RECEIVED') {
          throw ErrorService.create(ErrorService.CODES.CONFLICT,
            'This supplier has an open purchase order. Close it before deactivating the supplier.',
            null, ErrorService.CATEGORY_CONFLICT);
        }
      }
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(SupplierRepository.SHEET_SUPPLIERS, supplierId, {
        is_active: active ? 'TRUE' : 'FALSE',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(active
          ? AuditService.ACTIONS.SUPPLIER_REACTIVATED
          : AuditService.ACTIONS.SUPPLIER_DEACTIVATED,
        'Suppliers', supplierId,
        (active ? 'Reactivated' : 'Deactivated') + ' supplier ' + record.name +
          (reason ? '. Reason: ' + reason : '.'));
      return SupplierRepository.getSupplier(supplierId);
    }, 'supplier-active');
  }

  return {
    getSupplier: getSupplier,
    createSupplier: createSupplier,
    updateSupplier: updateSupplier,
    setActive: setActive
  };
})();