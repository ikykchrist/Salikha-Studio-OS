/**
 * PartnerService.gs
 * Partner registry (Sprint 6): referral, supplier, sub-contractor, venue
 * partners with commission rates. Pure registry - no financial posting.
 * Commission lifecycle lives in PartnerCommissionService.
 */

var PartnerService = (function () {
  'use strict';

  var TYPE_REFERRAL = 'REFERRAL';
  var TYPE_SUPPLIER = 'SUPPLIER';
  var TYPE_SUB_CONTRACTOR = 'SUB_CONTRACTOR';
  var TYPE_VENUE = 'VENUE';
  var TYPE_OTHER = 'OTHER';
  var PARTNER_TYPES = [TYPE_REFERRAL, TYPE_SUPPLIER, TYPE_SUB_CONTRACTOR, TYPE_VENUE, TYPE_OTHER];

  var COMMISSION_PENDING = 'PENDING';
  var COMMISSION_DUE = 'DUE';
  var COMMISSION_PAID = 'PAID';
  var COMMISSION_STATUSES = [COMMISSION_PENDING, COMMISSION_DUE, COMMISSION_PAID];

  function assertDatabase() {
    PartnerRepository.assertDatabase();
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function toBool(value) {
    return value === true || String(value) === 'TRUE';
  }

  function requirePartner(partnerId) {
    var record = PartnerRepository.findPartnerById(partnerId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.PARTNER_NOT_FOUND,
        'The partner was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  function requireActivePartner(partnerId) {
    var record = requirePartner(partnerId);
    if (!toBool(record.is_active)) {
      throw ErrorService.create(
        ErrorService.CODES.PARTNER_INACTIVE,
        'The partner is inactive.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return record;
  }

  function validatePartnerPayload(payload) {
    var nameCheck = ValidationService.isNonEmptyString(payload.name, 'Partner name', 120);
    if (!nameCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var partnerType = String(payload.partnerType || TYPE_OTHER).toUpperCase();
    var typeCheck = ValidationService.isEnum(partnerType, PARTNER_TYPES, 'Partner type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var commissionRate = number(payload.commissionRatePct);
    if (commissionRate < 0 || commissionRate > 100) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Commission rate must be between 0 and 100.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var email = ValidationService.trimSafe(payload.email);
    if (email) {
      var emailCheck = ValidationService.isEmail(email, 'Email');
      if (!emailCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, emailCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    var name = ValidationService.trimSafe(payload.name);
    if (PartnerRepository.countByName(name) > 1) {
      throw ErrorService.create(ErrorService.CODES.PARTNER_NAME_CONFLICT,
        'A partner with this name already exists.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return {
      name: name,
      partnerType: partnerType,
      contactPhone: ValidationService.trimSafe(payload.contactPhone),
      email: email,
      commissionRatePct: commissionRate,
      notes: ValidationService.trimSafe(payload.notes)
    };
  }

  function createPartner(payload) {
    assertDatabase();
    var data = validatePartnerPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var partnerId = IdService.generateId('PTR');
      RepositoryService.appendRecord(PartnerRepository.SHEET_PARTNERS, {
        partner_id: partnerId,
        name: data.name,
        partner_type: data.partnerType,
        contact_phone: data.contactPhone,
        email: data.email,
        commission_rate_pct: data.commissionRatePct,
        is_active: 'TRUE',
        notes: data.notes,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.PARTNER_CREATED, 'Partners', partnerId,
        'Partner "' + data.name + '" created (' + data.partnerType + ').');
      return getPartner(partnerId);
    }, 'partner-create');
  }

  function updatePartner(payload) {
    assertDatabase();
    var partnerId = ValidationService.trimSafe(payload.partnerId);
    var record = requirePartner(partnerId);
    var data = validatePartnerPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(PartnerRepository.SHEET_PARTNERS, partnerId, {
        name: data.name,
        partner_type: data.partnerType,
        contact_phone: data.contactPhone,
        email: data.email,
        commission_rate_pct: data.commissionRatePct,
        notes: data.notes,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PARTNER_UPDATED, 'Partners', partnerId,
        'Partner "' + data.name + '" updated.');
      return getPartner(partnerId);
    }, 'partner-update');
  }

  function setPartnerActive(partnerId, active) {
    assertDatabase();
    var record = requirePartner(partnerId);
    if (toBool(record.is_active) === !!active) {
      return getPartner(partnerId);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(PartnerRepository.SHEET_PARTNERS, partnerId, {
        is_active: active ? 'TRUE' : 'FALSE',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(active ? AuditService.ACTIONS.PARTNER_REACTIVATED : AuditService.ACTIONS.PARTNER_DEACTIVATED,
        'Partners', partnerId,
        'Partner "' + record.name + '" ' + (active ? 'reactivated' : 'deactivated') + '.');
      return getPartner(partnerId);
    }, 'partner-active');
  }

  function getPartner(partnerId) {
    assertDatabase();
    var record = requirePartner(partnerId);
    return RepositoryService.toPublicRecord(record);
  }

  function listPartners(filters) {
    assertDatabase();
    return PartnerRepository.listPartners(filters || {});
  }

  return {
    createPartner: createPartner,
    updatePartner: updatePartner,
    setPartnerActive: setPartnerActive,
    getPartner: getPartner,
    listPartners: listPartners,
    requirePartner: requirePartner,
    requireActivePartner: requireActivePartner,
    PARTNER_TYPES: PARTNER_TYPES.slice(0),
    COMMISSION_STATUSES: COMMISSION_STATUSES.slice(0),
    TYPE_REFERRAL: TYPE_REFERRAL,
    TYPE_SUPPLIER: TYPE_SUPPLIER,
    TYPE_SUB_CONTRACTOR: TYPE_SUB_CONTRACTOR,
    TYPE_VENUE: TYPE_VENUE,
    TYPE_OTHER: TYPE_OTHER,
    COMMISSION_PENDING: COMMISSION_PENDING,
    COMMISSION_DUE: COMMISSION_DUE,
    COMMISSION_PAID: COMMISSION_PAID
  };
})();