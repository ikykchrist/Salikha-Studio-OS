/**
 * PartnerCommissionService.gs
 * Partner commission lifecycle (Sprint 6): created when a booking with a
 * commission-bearing partner is confirmed, advanced to DUE when the event
 * completes, and settled (PAID) through a partner payment that posts
 * exactly one VERIFIED EXPENSE cash transaction. Immutability rules per
 * FINANCIAL_RULES.md: corrections void the linked cash transaction and
 * reopen the commission.
 */

var PartnerCommissionService = (function () {
  'use strict';

  function assertDatabase() {
    PartnerRepository.assertDatabase();
    SheetSchemaService.getSchema(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    SheetSchemaService.getSchema(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    SheetSchemaService.getSchema(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function requireCommission(commissionId) {
    var record = PartnerRepository.findCommissionById(commissionId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.COMMISSION_NOT_FOUND,
        'The commission record was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  function getCommission(commissionId) {
    assertDatabase();
    var record = requireCommission(commissionId);
    return RepositoryService.toPublicRecord(record);
  }

  /**
   * Resolves the fallback operating expense category used when the
   * commission itself carries no category (mirrors ExpenseService).
   */
  function resolveExpenseCategoryId() {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.category_type) !== FinancialCategoryService.TYPE_OPERATING_EXPENSE) {
        continue;
      }
      var active = r.is_active === true || String(r.is_active) !== 'FALSE';
      if (active) {
        return r.category_id;
      }
    }
    throw ErrorService.create(
      ErrorService.CODES.CATEGORY_NOT_FOUND,
      'No active operating expense category is available to record the commission.',
      null,
      ErrorService.CATEGORY_CONFIGURATION
    );
  }

  /**
   * Creates a PENDING commission for a booking and partner. Called by the
   * booking workflow at confirmation (Sprint 3+); exposed here for the
   * Sprint 6 partner module.
   */
  function createCommission(payload) {
    assertDatabase();
    var bookingId = ValidationService.trimSafe(payload.bookingId);
    var partnerId = ValidationService.trimSafe(payload.partnerId);
    var record = PartnerRepository.findCommissionByBookingAndPartner(bookingId, partnerId);
    if (record) {
      return RepositoryService.toPublicRecord(record);
    }

    var partner = PartnerService.requireActivePartner(partnerId);
    var baseAmount = number(payload.baseAmount);
    var ratePct = number(payload.ratePct);
    if (baseAmount < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Commission base amount must be non-negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (ratePct < 0 || ratePct > 100) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Commission rate must be between 0 and 100.', null, ErrorService.CATEGORY_VALIDATION);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var commissionId = IdService.generateId('PCM');
      var commissionAmount = Number((baseAmount * ratePct / 100).toFixed(2));
      RepositoryService.appendRecord(PartnerRepository.SHEET_COMMISSIONS, {
        commission_id: commissionId,
        booking_id: bookingId,
        partner_id: partnerId,
        base_amount: baseAmount,
        rate_pct: ratePct,
        commission_amount: commissionAmount,
        status: PartnerService.COMMISSION_PENDING,
        cash_transaction_id: '',
        settled_at: '',
        idempotency_key: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.COMMISSION_CREATED, 'PartnerCommissions', commissionId,
        'Commission ' + Number(commissionAmount).toFixed(2) + ' (' + Number(ratePct).toFixed(2) + '%) created for booking ' + bookingId + '.');
      return getCommission(commissionId);
    }, 'commission-create');
  }

  /**
   * Advances PENDING -> DUE (policy: event completed / receivable collected).
   */
  function advanceToDue(commissionId, reason) {
    assertDatabase();
    var record = requireCommission(commissionId);
    if (String(record.status) !== PartnerService.COMMISSION_PENDING) {
      return RepositoryService.toPublicRecord(record);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(PartnerRepository.SHEET_COMMISSIONS, commissionId, {
        status: PartnerService.COMMISSION_DUE,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.COMMISSION_DUE, 'PartnerCommissions', commissionId,
        'Commission marked due. ' + (reason || ''));
      return getCommission(commissionId);
    }, 'commission-due');
  }

  /**
   * Settles a DUE commission: posts exactly one VERIFIED EXPENSE cash
   * transaction (idempotency-protected), links it, and marks PAID.
   */
  function settleCommission(payload) {
    assertDatabase();
    var commissionId = ValidationService.trimSafe(payload.commissionId);
    var record = requireCommission(commissionId);
    if (String(record.status) !== PartnerService.COMMISSION_DUE) {
      throw ErrorService.create(
        ErrorService.CODES.COMMISSION_NOT_DUE,
        'Only DUE commissions can be settled.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    if (record.cash_transaction_id && String(record.cash_transaction_id) !== '') {
      throw ErrorService.create(
        ErrorService.CODES.COMMISSION_ALREADY_PAID,
        'This commission already has a linked cash transaction.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    var amount = number(record.commission_amount);
    if (amount <= 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Commission amount must be positive to settle.', null, ErrorService.CATEGORY_VALIDATION);
    }

    CashAccountService.requireActiveAccount(payload.cashAccountId);
    var categoryId = record.category_id || resolveExpenseCategoryId();

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var partner = PartnerService.requirePartner(record.partner_id);

      var posted = CashTransactionService.postTransaction({
        transactionType: CashTransactionService.TYPE_EXPENSE,
        categoryId: categoryId,
        accountId: payload.cashAccountId,
        amount: amount,
        description: 'Partner commission paid: ' + partner.name + ' (' + commissionId + ').',
        referenceNumber: ValidationService.trimSafe(payload.referenceNumber),
        sourceType: CashTransactionService.SOURCE_COMMISSION,
        sourceId: 'PENDING',
        transactionDate: payload.settledDate || DateService.toIsoDate(DateService.now()),
        idempotencyKey: payload.idempotencyKey || ('CMP-' + IdService.generateRaw())
      });
      if (posted.duplicate) {
        throw ErrorService.create(ErrorService.CODES.DUPLICATE_TRANSACTION,
          'A duplicate cash transaction was detected. No commission settlement was created.',
          null, ErrorService.CATEGORY_CONFLICT);
      }

      try {
        RepositoryService.updateById(PartnerRepository.SHEET_COMMISSIONS, commissionId, {
          status: PartnerService.COMMISSION_PAID,
          cash_transaction_id: posted.transaction.transactionId,
          settled_at: now,
          idempotency_key: posted.transaction.idempotencyKey || '',
          updated_at: now,
          updated_by: actor.userId,
          version: Number(record.version || 1) + 1
        });
      } catch (e) {
        CashTransactionService.voidTransactionInternal(posted.transaction.transactionId,
          'Settlement bookkeeping failed; cash transaction rolled back.');
        throw e;
      }
      AuditService.info(AuditService.ACTIONS.COMMISSION_PAID, 'PartnerCommissions', commissionId,
        'Commission settled at ' + Number(amount).toFixed(2) + ' (TX ' + posted.transaction.transactionId + ').');
      return getCommission(commissionId);
    }, 'commission-settle');
  }

  /**
   * Reverts a PAID commission: voids the linked cash transaction and
   * reopens the commission as DUE. Reason required.
   */
  function voidSettledCommission(commissionId, reason) {
    assertDatabase();
    var record = requireCommission(commissionId);
    if (String(record.status) !== PartnerService.COMMISSION_PAID) {
      throw ErrorService.create(
        ErrorService.CODES.COMMISSION_NOT_PAID,
        'Only PAID commissions can be voided.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    var reasonCheck = ValidationService.isNonEmptyString(reason, 'Void reason', 500);
    if (!reasonCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, reasonCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!record.cash_transaction_id) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'The linked cash transaction is missing; cannot void.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      CashTransactionService.voidTransactionInternal(record.cash_transaction_id, reason);
      RepositoryService.updateById(PartnerRepository.SHEET_COMMISSIONS, commissionId, {
        status: PartnerService.COMMISSION_DUE,
        cash_transaction_id: '',
        settled_at: '',
        idempotency_key: '',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.COMMISSION_VOIDED, 'PartnerCommissions', commissionId,
        'Commission settlement voided: ' + reason);
      return getCommission(commissionId);
    }, 'commission-void');
  }

  function listCommissions(filters) {
    assertDatabase();
    return PartnerRepository.listCommissions(filters || {});
  }

  return {
    createCommission: createCommission,
    advanceToDue: advanceToDue,
    settleCommission: settleCommission,
    voidSettledCommission: voidSettledCommission,
    getCommission: getCommission,
    listCommissions: listCommissions
  };
})();