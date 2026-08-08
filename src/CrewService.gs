/**
 * CrewService.gs
 * Crew domain (Sprint 6, WF-5/WF-6): crew members, assignments,
 * per-event sign-off, and crew payments.
 *
 * Money rule (docs/FINANCIAL_RULES.md §12): each paid crew payment mints
 * exactly one EXPENSE cash transaction (-net) with a cash_transaction_id
 * and an idempotency_key for duplicate protection. Voiding a crew payment
 * voids its linked ledger transaction; the assignment returns to UNPAID.
 *
 * Sign-off feeds the deployment reconciliation gate (CrewRepository is
 * read by DeploymentService.validateCrewSignoff).
 */

var CrewService = (function () {
  'use strict';

  var PAY_RATE_HOURLY = 'HOURLY';
  var PAY_RATE_DAILY = 'DAILY';
  var PAY_RATE_FLAT = 'FLAT';
  var PAY_RATE_TYPES = [PAY_RATE_HOURLY, PAY_RATE_DAILY, PAY_RATE_FLAT];

  var PAY_STATUS_UNPAID = 'UNPAID';
  var PAY_STATUS_PENDING = 'PENDING';
  var PAY_STATUS_PAID = 'PAID';
  var PAY_STATUSES = [PAY_STATUS_UNPAID, PAY_STATUS_PENDING, PAY_STATUS_PAID];

  function assertDatabase() {
    CrewRepository.assertDatabase();
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function round2(value) {
    return BookingPricingService.round2(value);
  }

  function toBool(value) {
    return value === true || String(value) === 'TRUE';
  }

  function requireCrewMember(crewMemberId) {
    var record = CrewRepository.findById(crewMemberId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.CREW_MEMBER_NOT_FOUND,
        'The crew member was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  function requireActiveCrewMember(crewMemberId) {
    var record = requireCrewMember(crewMemberId);
    if (!toBool(record.is_active)) {
      throw ErrorService.create(
        ErrorService.CODES.CREW_MEMBER_INACTIVE,
        'The crew member is inactive.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return record;
  }

  function requireAssignment(crewAssignId) {
    var record = CrewRepository.findAssignmentById(crewAssignId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.CREW_ASSIGNMENT_NOT_FOUND,
        'The crew assignment was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  function requireCrewPayment(crewPaymentId) {
    var record = CrewRepository.findCrewPaymentById(crewPaymentId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.CREW_PAYMENT_NOT_FOUND,
        'The crew payment was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  /**
   * Resolves the booking for an assignment. A deployment (when given)
   * authoritatively provides its booking (1:1).
   */
  function resolveBookingId(bookingId, deploymentId) {
    if (deploymentId) {
      var deployment = DeploymentRepository.findDeploymentById(deploymentId);
      if (!deployment) {
        throw ErrorService.create(ErrorService.CODES.DEPLOYMENT_NOT_FOUND,
          'The deployment was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
      }
      return String(deployment.booking_id || '');
    }
    if (bookingId) {
      var booking = BookingRepository.findById(bookingId);
      if (!booking) {
        throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND,
          'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
      }
      return String(bookingId);
    }
    return '';
  }

  /* ------------------- Crew members ------------------- */

  function validateCrewPayload(payload) {
    var nameCheck = ValidationService.isNonEmptyString(payload.name, 'Crew name', 120);
    if (!nameCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var payRateType = String(payload.payRateType || PAY_RATE_HOURLY).toUpperCase();
    var typeCheck = ValidationService.isEnum(payRateType, PAY_RATE_TYPES, 'Pay rate type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var payRate = number(payload.payRate);
    var rateCheck = ValidationService.isNonNegativeAmount(payRate, 'Pay rate');
    if (!rateCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, rateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var email = ValidationService.trimSafe(payload.email);
    if (email) {
      var emailCheck = ValidationService.isEmail(email, 'Email');
      if (!emailCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, emailCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    return {
      name: ValidationService.trimSafe(payload.name),
      phone: ValidationService.trimSafe(payload.phone),
      email: email,
      roleTags: ValidationService.trimSafe(payload.roleTags),
      payRateType: payRateType,
      payRate: payRate,
      notes: ValidationService.trimSafe(payload.notes)
    };
  }

  function createCrew(payload) {
    assertDatabase();
    var data = validateCrewPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var crewMemberId = IdService.generateId('CM');
      RepositoryService.appendRecord(CrewRepository.SHEET_CREW, {
        crew_member_id: crewMemberId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        role_tags: data.roleTags,
        pay_rate_type: data.payRateType,
        pay_rate: data.payRate,
        is_active: 'TRUE',
        notes: data.notes,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.CREW_MEMBER_CREATED, 'Crew', crewMemberId,
        'Crew member "' + data.name + '" created.');
      return getCrew(crewMemberId);
    }, 'crew-create');
  }

  function updateCrew(payload) {
    assertDatabase();
    var crewMemberId = ValidationService.trimSafe(payload.crewMemberId);
    var record = requireCrewMember(crewMemberId);
    if (!toBool(record.is_active)) {
      throw ErrorService.create(
        ErrorService.CODES.CREW_MEMBER_INACTIVE,
        'Inactive crew members cannot be edited.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    var data = validateCrewPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(CrewRepository.SHEET_CREW, crewMemberId, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        role_tags: data.roleTags,
        pay_rate_type: data.payRateType,
        pay_rate: data.payRate,
        notes: data.notes,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.CREW_MEMBER_UPDATED, 'Crew', crewMemberId,
        'Crew member "' + data.name + '" updated.');
      return getCrew(crewMemberId);
    }, 'crew-update');
  }

  function setCrewActive(crewMemberId, active, reason) {
    assertDatabase();
    var record = requireCrewMember(crewMemberId);
    if (toBool(record.is_active) === !!active) {
      return getCrew(crewMemberId);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(CrewRepository.SHEET_CREW, crewMemberId, {
        is_active: active ? 'TRUE' : 'FALSE',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(active ? AuditService.ACTIONS.CREW_MEMBER_REACTIVATED : AuditService.ACTIONS.CREW_MEMBER_DEACTIVATED,
        'Crew', crewMemberId,
        'Crew member "' + record.name + '" ' + (active ? 'reactivated' : 'deactivated') +
        (ValidationService.trimSafe(reason) ? '. Reason: ' + ValidationService.trimSafe(reason) : '') + '.');
      return getCrew(crewMemberId);
    }, 'crew-active');
  }

  function getCrew(crewMemberId) {
    assertDatabase();
    var record = requireCrewMember(crewMemberId);
    return RepositoryService.toPublicRecord(record);
  }

  function listCrew(filters) {
    assertDatabase();
    return CrewRepository.listCrew(filters || {});
  }

  /* ------------------- Assignments ------------------- */

  function computePayAmount(payRateType, payRate, hours) {
    var rate = number(payRate);
    if (payRateType === PAY_RATE_HOURLY) {
      return round2(rate * number(hours));
    }
    return round2(rate);
  }

  /**
   * Builds assignment data with a server computed pay amount.
   * Rate defaults to the crew member's rate when not supplied.
   */
  function buildAssignmentData(payload, member) {
    var bookingId = ValidationService.trimSafe(payload.bookingId);
    var deploymentId = ValidationService.trimSafe(payload.deploymentId);
    var resolvedBooking = resolveBookingId(bookingId, deploymentId);
    if (!resolvedBooking) {
      throw ErrorService.create(ErrorService.CODES.CREW_ASSIGNMENT_BOOKING_REQUIRED,
        'A crew assignment requires a booking or a deployment.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var payRateType = String(payload.payRateType || member.pay_rate_type || PAY_RATE_HOURLY).toUpperCase();
    var payRate = number(payload.payRate !== undefined ? payload.payRate : member.pay_rate);
    var hours = number(payload.hours);
    if (hours < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Hours cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (PAY_RATE_TYPES.indexOf(payRateType) === -1) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        payRateType + ' is not a valid pay rate type.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var payAmount = computePayAmount(payRateType, payRate, hours);
    return {
      bookingId: resolvedBooking,
      deploymentId: deploymentId,
      crewMemberId: member.crew_member_id,
      role: String(payload.role || '').trim(),
      payRateType: payRateType,
      payRate: payRate,
      hours: hours,
      payAmount: payAmount
    };
  }

  function createAssignment(payload) {
    assertDatabase();
    var member = requireActiveCrewMember(String(payload.crewMemberId || '').trim());
    var data = buildAssignmentData(payload, member);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var crewAssignId = IdService.generateId('CSA');
      RepositoryService.appendRecord(CrewRepository.SHEET_ASSIGNMENTS, {
        crew_assign_id: crewAssignId,
        booking_id: data.bookingId,
        deployment_id: data.deploymentId,
        crew_member_id: data.crewMemberId,
        role: data.role,
        pay_rate: data.payRate,
        hours: data.hours,
        pay_amount: data.payAmount,
        signed_off: 'FALSE',
        signoff_at: '',
        signoff_by: '',
        pay_status: PAY_STATUS_UNPAID,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.CREW_ASSIGNMENT_CREATED, 'CrewAssignments', crewAssignId,
        'Crew ' + data.crewMemberId + ' assigned to booking ' + data.bookingId +
        (data.deploymentId ? ' / deployment ' + data.deploymentId : '') + '.');
      return getAssignment(crewAssignId);
    }, 'crew-assign');
  }

  function updateAssignment(payload) {
    assertDatabase();
    var crewAssignId = String(payload.crewAssignId || '').trim();
    var record = requireAssignment(crewAssignId);
    if (String(record.pay_status) === PAY_STATUS_PAID) {
      throw ErrorService.create(
        ErrorService.CODES.CREW_ASSIGNMENT_ALREADY_PAID,
        'Paid assignments cannot be edited. Void the crew payment first.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var hours = number(payload.hours !== undefined ? payload.hours : record.hours);
      var payRate = number(payload.payRate !== undefined ? payload.payRate : record.pay_rate);
      if (hours < 0 || payRate < 0) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'Hours and pay rate cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
      }
      var payRateType = String(payload.payRateType || record.pay_rate_type || PAY_RATE_HOURLY).toUpperCase();
      RepositoryService.updateById(CrewRepository.SHEET_ASSIGNMENTS, crewAssignId, {
        role: payload.role !== undefined ? String(payload.role || '').trim() : record.role,
        pay_rate: payRate,
        hours: hours,
        pay_amount: computePayAmount(payRateType, payRate, hours),
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.CREW_ASSIGNMENT_UPDATED, 'CrewAssignments', crewAssignId,
        'Assignment updated.');
      return getAssignment(crewAssignId);
    }, 'crew-assign-update');
  }

  /**
   * Records a crew member's sign-off for their event. Sign-off is
   * optional at the assignment level but required before reconciliation
   * (the deployment gate).
   */
  function signOffAssignment(crewAssignId) {
    assertDatabase();
    var record = requireAssignment(crewAssignId);
    if (toBool(record.signed_off)) {
      return getAssignment(crewAssignId);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(CrewRepository.SHEET_ASSIGNMENTS, crewAssignId, {
        signed_off: 'TRUE',
        signoff_at: now,
        signoff_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.CREW_ASSIGNMENT_SIGNED_OFF, 'CrewAssignments', crewAssignId,
        'Crew assignment signed off.');
      return getAssignment(crewAssignId);
    }, 'crew-signoff');
  }

  function getAssignment(crewAssignId) {
    assertDatabase();
    var record = requireAssignment(crewAssignId);
    return RepositoryService.toPublicRecord(record);
  }

  function listAssignments(filters) {
    assertDatabase();
    return CrewRepository.listAssignments(filters || {});
  }

  /* ------------------- Crew payments ------------------- */

  function getPaymentIdempotencyKey(key) {
    var clean = ValidationService.trimSafe(key);
    if (!clean) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'An idempotency key is required when posting a crew payment.',
        null, ErrorService.CATEGORY_VALIDATION);
    }
    return clean;
  }

  function postExpenseLedger(opts) {
    var posting = CashTransactionService.postTransaction({
      transactionType: CashTransactionService.TYPE_EXPENSE,
      accountId: opts.accountId,
      amount: opts.amount,
      description: opts.description,
      transactionDate: opts.date || undefined,
      sourceType: CashTransactionService.SOURCE_CREW,
      sourceId: opts.sourceId,
      idempotencyKey: opts.idempotencyKey
    });
    if (posting.duplicate) {
      throw ErrorService.create(ErrorService.CODES.CREW_PAYMENT_DUPLICATE,
        'This crew payment has already been recorded.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return posting;
  }

  /**
   * Pays an unpaid assignment: money-legal, atomic under one lock.
   * Side effects (same request):
   *   - one EXPENSE cash transaction (-amount) on the chosen account
   *   - a CrewPayments row linking cash_transaction_id + idempotency_key
   *   - assignment pay_status -> PAID
   */
  function payAssignment(payload) {
    assertDatabase();
    var crewAssignId = String(payload.crewAssignId || '').trim();
    var record = requireAssignment(crewAssignId);
    if (String(record.pay_status) === PAY_STATUS_PAID) {
      throw ErrorService.create(ErrorService.CODES.CREW_ASSIGNMENT_ALREADY_PAID,
        'This crew assignment has already been paid. Void the payment to reopen it.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    var amount = number(payload.amount !== undefined ? payload.amount : record.pay_amount);
    var amountCheck = ValidationService.isPositiveAmount(amount, 'Payment amount');
    if (!amountCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT, amountCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (Math.abs(round2(amount) - round2(number(record.pay_amount))) > 0.005) {
      throw ErrorService.create(ErrorService.CODES.CREW_PAYMENT_AMOUNT_MISMATCH,
        'Payment amount must match the assignment pay amount (' + Number(record.pay_amount).toFixed(2) + ').',
        null, ErrorService.CATEGORY_VALIDATION);
    }
    var idempotencyKey = getPaymentIdempotencyKey(payload.idempotencyKey);
    var member = requireActiveCrewMember(record.crew_member_id);
    var memberName = member.name || record.crew_member_id;

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var ledger = postExpenseLedger({
        accountId: payload.cashAccountId,
        amount: amount,
        description: 'Crew payment: ' + memberName + ' (' + crewAssignId + ')',
        date: payload.paidDate,
        sourceId: crewAssignId,
        idempotencyKey: idempotencyKey
      });

      var crewPaymentId = IdService.generateId('CPY');
      RepositoryService.appendRecord(CrewRepository.SHEET_PAYMENTS, {
        crew_payment_id: crewPaymentId,
        crew_assign_id: crewAssignId,
        crew_member_id: record.crew_member_id,
        amount: round2(amount),
        paid_at: payload.paidDate ? String(payload.paidDate).substring(0, 10) : DateService.toIsoDate(DateService.now()),
        method: String(payload.method || 'CASH').toUpperCase(),
        cash_account_id: payload.cashAccountId,
        cash_transaction_id: ledger.transaction.transaction_id || ledger.transaction.transactionId || '',
        idempotency_key: idempotencyKey,
        voided_at: '',
        voided_by: '',
        void_reason: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      RepositoryService.updateById(CrewRepository.SHEET_ASSIGNMENTS, crewAssignId, {
        pay_status: PAY_STATUS_PAID,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.CREW_PAYMENT_RECORDED, 'CrewPayments', crewPaymentId,
        'Crew payment ' + round2(amount).toFixed(2) + ' to ' + memberName + '.');
      return {
        crewPaymentId: crewPaymentId,
        transactionId: ledger.transaction.transactionId || ledger.transaction.transaction_id,
        balanceAfter: ledger.balanceAfter,
        assignment: getAssignment(crewAssignId)
      };
    }, 'crew-pay');
  }

  /**
   * Voids a crew payment and its linked ledger transaction. The
   * assignment returns to UNPAID.
   */
  function voidCrewPayment(payload) {
    assertDatabase();
    var crewPaymentId = String(payload.crewPaymentId || '').trim();
    var record = requireCrewPayment(crewPaymentId);
    if (record.voided_at && String(record.voided_at) !== '') {
      throw ErrorService.create(ErrorService.CODES.CREW_PAYMENT_ALREADY_VOIDED,
        'This crew payment is already voided.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var reason = ValidationService.trimSafe(payload.voidReason);
    var reasonCheck = ValidationService.isNonEmptyString(reason, 'Void reason', 400);
    if (!reasonCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, reasonCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      if (record.cash_transaction_id) {
        CashTransactionService.voidTransactionInternal(record.cash_transaction_id, reason);
      }
      RepositoryService.updateById(CrewRepository.SHEET_PAYMENTS, crewPaymentId, {
        voided_at: now,
        voided_by: actor.userId,
        void_reason: reason,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      var assignment = CrewRepository.findAssignmentById(record.crew_assign_id);
      if (assignment) {
        RepositoryService.updateById(CrewRepository.SHEET_ASSIGNMENTS, record.crew_assign_id, {
          pay_status: PAY_STATUS_UNPAID,
          updated_at: now,
          updated_by: actor.userId,
          version: Number(assignment.version || 1) + 1
        });
      }
      AuditService.info(AuditService.ACTIONS.CREW_PAYMENT_VOIDED, 'CrewPayments', crewPaymentId,
        'Crew payment voided. Reason: ' + reason + '.');
      return getCrewPayment(crewPaymentId);
    }, 'crew-pay-void');
  }

  function getCrewPayment(crewPaymentId) {
    assertDatabase();
    var record = requireCrewPayment(crewPaymentId);
    return RepositoryService.toPublicRecord(record);
  }

  function listCrewPayments(filters) {
    assertDatabase();
    return CrewRepository.listCrewPayments(filters || {});
  }

  return {
    createCrew: createCrew,
    updateCrew: updateCrew,
    setCrewActive: setCrewActive,
    getCrew: getCrew,
    listCrew: listCrew,
    createAssignment: createAssignment,
    updateAssignment: updateAssignment,
    signOffAssignment: signOffAssignment,
    getAssignment: getAssignment,
    listAssignments: listAssignments,
    payAssignment: payAssignment,
    voidCrewPayment: voidCrewPayment,
    getCrewPayment: getCrewPayment,
    listCrewPayments: listCrewPayments,
    PAY_RATE_TYPES: PAY_RATE_TYPES.slice(0),
    PAY_RATE_HOURLY: PAY_RATE_HOURLY,
    PAY_RATE_DAILY: PAY_RATE_DAILY,
    PAY_RATE_FLAT: PAY_RATE_FLAT,
    PAY_STATUSES: PAY_STATUSES.slice(0),
    PAY_STATUS_UNPAID: PAY_STATUS_UNPAID,
    PAY_STATUS_PENDING: PAY_STATUS_PENDING,
    PAY_STATUS_PAID: PAY_STATUS_PAID
  };
})();