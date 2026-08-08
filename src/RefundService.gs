/**
 * RefundService.gs
 * Refund foundation (Sprint 3). Refunds follow FINANCIAL_RULES §9:
 * they reference an existing valid payment, never exceed the
 * refundable amount, create a REFUND cash outflow, and are reported
 * separately from operating expenses.
 */

var RefundService = (function () {
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

  /**
   * Refundable amount for a payment = payment amount - valid refunds.
   * Voided payments and already-refunded balances are not refundable.
   */
  function getRefundEligibility(paymentId) {
    assertDatabase();
    var payment = PaymentRepository.findPaymentById(paymentId);
    if (!payment) {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_NOT_FOUND, 'The payment was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (String(payment.status) === 'VOIDED') {
      return {
        paymentId: paymentId,
        refundableAmount: 0,
        reason: 'VOIDED_PAYMENT'
      };
    }
    var refunded = PaymentRepository.getPaymentRefundedTotal(paymentId);
    var refundable = BookingPricingService.round2(Number(payment.amount || 0) - refunded);
    return {
      paymentId: paymentId,
      paymentAmount: Number(payment.amount || 0),
      refunded: refunded,
      refundableAmount: Math.max(refundable, 0)
    };
  }

  /**
   * Records a refund with a linked REFUND cash outflow, atomically
   * under one lock.
   */
  function recordRefund(payload) {
    assertDatabase();
    var payment = PaymentRepository.findPaymentById(payload.paymentId);
    if (!payment) {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_NOT_FOUND, 'The payment was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (String(payment.status) === 'VOIDED') {
      throw ErrorService.create(ErrorService.CODES.REFUND_NOT_ALLOWED,
        'A voided payment cannot be refunded.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var amount = Number(payload.amount);
    var amountCheck = ValidationService.isPositiveAmount(amount, 'Refund amount');
    if (!amountCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, amountCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var eligibility = getRefundEligibility(payload.paymentId);
    if (amount - eligibility.refundableAmount > 0.005) {
      throw ErrorService.create(ErrorService.CODES.REFUND_EXCEEDS_AVAILABLE_AMOUNT,
        'The refund amount exceeds the available refundable amount (' + eligibility.refundableAmount + ').',
        null, ErrorService.CATEGORY_VALIDATION);
    }
    var reason = ValidationService.trimSafe(payload.reason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A refund reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.refundDate) {
      var dateCheck = ValidationService.isDate(payload.refundDate, 'Refund date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    CashAccountService.requireActiveAccount(payload.cashAccountId);

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      if (payload.idempotencyKey) {
        var existing = RepositoryService.findByField(SheetSchemaService.SHEET_REFUNDS, 'idempotency_key', payload.idempotencyKey);
        if (existing.length > 0) {
          return { duplicate: true, refund: getRefund(existing[0].refund_id) };
        }
      }

      var categoryId = findRefundCategory();
      if (!categoryId) {
        throw ErrorService.create(ErrorService.CODES.REFUND_NOT_ALLOWED,
          'The refund category is missing. Run database initialization.',
          null, ErrorService.CATEGORY_CONFIGURATION);
      }

      var booking = BookingRepository.findById(payment.booking_id);
      var posted = CashTransactionService.postTransaction({
        transactionType: CashTransactionService.TYPE_REFUND,
        categoryId: categoryId,
        accountId: payload.cashAccountId,
        amount: amount,
        description: 'Refund for payment ' + payment.payment_code + ' on booking ' + (booking ? booking.booking_code : payment.booking_id) + '.',
        referenceNumber: payload.referenceNumber || payment.reference_number || '',
        sourceType: 'REFUND',
        sourceId: 'PENDING',
        transactionDate: payload.refundDate || DateService.toIsoDate(DateService.now())
      });
      if (posted.duplicate) {
        throw ErrorService.create(ErrorService.CODES.DUPLICATE_TRANSACTION,
          'A duplicate cash transaction was detected. No refund was created.', null, ErrorService.CATEGORY_CONFLICT);
      }

      try {
        var refundId = IdService.generateId('RFN');
        RepositoryService.appendRecord(SheetSchemaService.SHEET_REFUNDS, {
          refund_id: refundId,
          refund_code: refundId,
          payment_id: payment.payment_id,
          booking_id: payment.booking_id,
          client_id: payment.client_id,
          refund_date: payload.refundDate || DateService.toIsoDate(DateService.now()),
          amount: amount,
          cash_account_id: payload.cashAccountId,
          reason: reason,
          status: 'POSTED',
          cash_transaction_id: posted.transaction.transactionId,
          idempotency_key: payload.idempotencyKey || '',
          created_at: now,
          created_by: actor.userId,
          voided_at: '',
          voided_by: '',
          void_reason: ''
        });
        RepositoryService.updateById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, posted.transaction.transactionId, {
          source_id: refundId
        });

        // Update payment refund status
        var refundedTotal = PaymentRepository.getPaymentRefundedTotal(payment.payment_id);
        var paymentStatus = refundedTotal + 0.005 >= Number(payment.amount || 0) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        RepositoryService.updateById(SheetSchemaService.SHEET_PAYMENTS, payment.payment_id, {
          status: paymentStatus,
          updated_at: now,
          updated_by: actor.userId,
          version: Number(payment.version || 1) + 1
        });

        ReceivableService.refreshBookingCaches(payment.booking_id);
        ReceivableService.refreshClientCachedTotals();

        AuditService.info(AuditService.ACTIONS.REFUND_RECORDED, 'Refunds', refundId,
          'Recorded refund of ' + amount + ' for payment ' + payment.payment_code + '. Reported separately from operating expenses.');
        return {
          duplicate: false,
          refund: getRefund(refundId),
          cashTransaction: posted.transaction,
          bookingSummary: ReceivableService.getBookingReceivableSummary(payment.booking_id)
        };
      } catch (e) {
        try {
          CashTransactionService.voidTransactionInternal(posted.transaction.transactionId, 'Compensating void: refund record failed.');
        } catch (ignored) {
          /* best effort */
        }
        throw e;
      }
    });
  }

  /**
   * Voids a refund and its linked cash transaction together.
   */
  function voidRefund(payload) {
    assertDatabase();
    var refund = PaymentRepository.findRefundById(payload.refundId);
    if (!refund) {
      throw ErrorService.create(ErrorService.CODES.NOT_FOUND, 'The refund was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var reason = ValidationService.trimSafe(payload.voidReason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A void reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (String(refund.status) === 'VOIDED') {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'This refund is already voided.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      if (refund.cash_transaction_id) {
        var txRecord = RepositoryService.findById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, refund.cash_transaction_id);
        if (txRecord && String(txRecord.status) !== 'VOIDED') {
          CashTransactionService.voidTransactionInternal(refund.cash_transaction_id, reason);
        }
      }
      RepositoryService.updateById(SheetSchemaService.SHEET_REFUNDS, payload.refundId, {
        status: 'VOIDED',
        voided_at: now,
        voided_by: actor.userId,
        void_reason: reason
      });
      // Recompute payment refund status
      var payment = PaymentRepository.findPaymentById(refund.payment_id);
      if (payment) {
        var refundedTotal = PaymentRepository.getPaymentRefundedTotal(payment.payment_id);
        var paymentStatus = refundedTotal + 0.005 >= Number(payment.amount || 0) ? 'REFUNDED' : 'POSTED';
        if (refundedTotal > 0 && paymentStatus === 'POSTED') {
          paymentStatus = 'PARTIALLY_REFUNDED';
        }
        if (String(payment.status) !== 'VOIDED') {
          RepositoryService.updateById(SheetSchemaService.SHEET_PAYMENTS, payment.payment_id, {
            status: paymentStatus,
            updated_at: now,
            updated_by: actor.userId
          });
        }
      }
      ReceivableService.refreshBookingCaches(refund.booking_id);
      ReceivableService.refreshClientCachedTotals();
      AuditService.info(AuditService.ACTIONS.REFUND_VOIDED, 'Refunds', payload.refundId,
        'Voided refund (linked cash transaction voided). Reason: ' + reason + '.');
      return { voided: true, refund: getRefund(payload.refundId) };
    });
  }

  function findRefundCategory() {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].category_name) === 'Client Refund') {
        return records[i].category_id;
      }
    }
    return null;
  }

  function getRefund(refundId) {
    var record = PaymentRepository.findRefundById(refundId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  return {
    getRefundEligibility: getRefundEligibility,
    recordRefund: recordRefund,
    voidRefund: voidRefund
  };
})();
