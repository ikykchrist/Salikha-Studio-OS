/**
 * PaymentService.gs
 * Payment recording and voiding (Sprint 3).
 *
 * Every posted payment creates exactly one linked BOOKING_PAYMENT cash
 * inflow. Voiding reverses both sides. Duplicate idempotency keys never
 * double-post. Booking creation never posts cash.
 */

var PaymentService = (function () {
  'use strict';

  var TYPES = ['DOWN_PAYMENT', 'PARTIAL_PAYMENT', 'FINAL_PAYMENT', 'FULL_PAYMENT', 'ADDITIONAL_PAYMENT', 'OTHER'];
  var METHODS = ['CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CARD', 'OTHER'];
  var STATUSES = ['POSTED', 'VOIDED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

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

  function requirePayment(paymentId) {
    var record = PaymentRepository.findPaymentById(paymentId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_NOT_FOUND, 'The payment was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function findBookingPaymentCategory() {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].category_name) === 'Client Booking Payment') {
        return records[i].category_id;
      }
    }
    return null;
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

  /**
   * Records a booking payment with allocation and linked cash inflow,
   * atomically under one lock.
   */
  function recordBookingPayment(payload) {
    assertDatabase();
    var bookingId = payload.bookingId;
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var amount = Number(payload.amount);
    var amountCheck = ValidationService.isPositiveAmount(amount, 'Payment amount');
    if (!amountCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, amountCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(payload.paymentType || 'PARTIAL_PAYMENT', TYPES, 'Payment type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var methodCheck = ValidationService.isEnum(payload.paymentMethod || 'CASH', METHODS, 'Payment method');
    if (!methodCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, methodCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.paymentDate) {
      var dateCheck = ValidationService.isDate(payload.paymentDate, 'Payment date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    CashAccountService.requireActiveAccount(payload.cashAccountId);

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      if (payload.idempotencyKey) {
        var existing = RepositoryService.findByField(SheetSchemaService.SHEET_PAYMENTS, 'idempotency_key', payload.idempotencyKey);
        if (existing.length > 0) {
          return { duplicate: true, payment: PaymentRepository.getPayment(existing[0].payment_id) };
        }
      }

      var gross = Number(booking.gross_booking_amount || 0);
      var paid = ReceivableService.getBookingPaid(bookingId);
      var balance = Math.max(BookingPricingService.round2(gross - paid), 0);
      var overpayment = amount - balance > 0.005;
      if (overpayment && payload.overrideConfirmation !== true) {
        throw ErrorService.create(ErrorService.CODES.PAYMENT_EXCEEDS_BALANCE,
          'The payment amount exceeds the booking balance. Confirm the overpayment to continue.',
          { balance: balance, amount: amount }, ErrorService.CATEGORY_CONFLICT);
      }

      var categoryId = findBookingPaymentCategory();
      if (!categoryId) {
        throw ErrorService.create(ErrorService.CODES.PAYMENT_LEDGER_POSTING_FAILED,
          'The booking-payment income category is missing. Run database initialization.',
          null, ErrorService.CATEGORY_CONFIGURATION);
      }

      // 1. Post the linked cash inflow first (validates account/category).
      var posted = CashTransactionService.postTransaction({
        transactionType: CashTransactionService.TYPE_BOOKING_PAYMENT,
        categoryId: categoryId,
        accountId: payload.cashAccountId,
        amount: amount,
        description: 'Booking payment for ' + (booking.booking_title || booking.booking_code) + ' (' + booking.booking_code + ').',
        referenceNumber: payload.referenceNumber || '',
        sourceType: CashTransactionService.SOURCE_PAYMENT,
        sourceId: 'PENDING',
        transactionDate: payload.paymentDate || DateService.toIsoDate(DateService.now())
      });
      if (posted.duplicate) {
        throw ErrorService.create(ErrorService.CODES.DUPLICATE_TRANSACTION,
          'A duplicate cash transaction was detected. No payment was created.', null, ErrorService.CATEGORY_CONFLICT);
      }

      try {
        // 2. Payment row
        var paymentId = IdService.generateId('PAY');
        RepositoryService.appendRecord(SheetSchemaService.SHEET_PAYMENTS, {
          payment_id: paymentId,
          payment_code: paymentId,
          client_id: booking.client_id,
          booking_id: bookingId,
          payment_date: payload.paymentDate || DateService.toIsoDate(DateService.now()),
          payment_datetime: now,
          payment_type: payload.paymentType || 'PARTIAL_PAYMENT',
          payment_method: payload.paymentMethod || 'CASH',
          cash_account_id: payload.cashAccountId,
          amount: amount,
          reference_number: ValidationService.trimSafe(payload.referenceNumber),
          payer_name: ValidationService.trimSafe(payload.payerName),
          notes: ValidationService.trimSafe(payload.notes),
          status: 'POSTED',
          cash_transaction_id: posted.transaction.transactionId,
          idempotency_key: payload.idempotencyKey || '',
          voided_at: '',
          voided_by: '',
          void_reason: '',
          created_at: now,
          created_by: actor.userId,
          updated_at: now,
          updated_by: actor.userId,
          version: 1
        });

        // 3. Allocation
        RepositoryService.appendRecord(SheetSchemaService.SHEET_PAYMENT_ALLOCATIONS, {
          allocation_id: IdService.generateId('ALC'),
          payment_id: paymentId,
          booking_id: bookingId,
          allocated_amount: amount,
          allocation_date: payload.paymentDate || DateService.toIsoDate(DateService.now()),
          created_at: now,
          created_by: actor.userId
        });

        // 4. Link payment id back into the cash transaction source
        RepositoryService.updateById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, posted.transaction.transactionId, {
          source_id: paymentId
        });

        // 5. Refresh caches
        ReceivableService.refreshBookingCaches(bookingId);
        ReceivableService.refreshClientCachedTotals();

        if (overpayment) {
          AuditService.info(AuditService.ACTIONS.PAYMENT_OVERPAYMENT_OVERRIDE, 'Payments', paymentId,
            'Overpayment of ' + amount + ' accepted with confirmation (balance was ' + balance + ').');
        }
        AuditService.info(AuditService.ACTIONS.PAYMENT_RECORDED, 'Payments', paymentId,
          'Recorded ' + amount + ' payment for booking ' + bookingId + '. Linked cash transaction ' + posted.transaction.transactionId + '.');
        return {
          duplicate: false,
          payment: PaymentRepository.getPayment(paymentId),
          cashTransaction: posted.transaction,
          bookingSummary: ReceivableService.getBookingReceivableSummary(bookingId)
        };
      } catch (e) {
        // Compensating void: payment rows failed after cash posting.
        try {
          CashTransactionService.voidTransactionInternal(posted.transaction.transactionId, 'Compensating void: payment record failed.');
        } catch (ignored) {
          /* best effort */
        }
        throw e;
      }
    });
  }

  /**
   * Voids a posted payment and its linked cash transaction together.
   */
  function voidBookingPayment(payload) {
    assertDatabase();
    var paymentId = payload.paymentId;
    var record = requirePayment(paymentId);
    var reason = ValidationService.trimSafe(payload.voidReason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A void reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (String(record.status) === 'VOIDED') {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_ALREADY_VOIDED,
        'This payment is already voided.', null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.status) === 'REFUNDED' || String(record.status) === 'PARTIALLY_REFUNDED') {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Refunded payments cannot be voided directly. Void the refund first.',
        null, ErrorService.CATEGORY_CONFLICT);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      // Void the linked cash transaction (internal path - no routing back).
      if (record.cash_transaction_id) {
        var txRecord = RepositoryService.findById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, record.cash_transaction_id);
        if (txRecord && String(txRecord.status) !== 'VOIDED') {
          CashTransactionService.voidTransactionInternal(record.cash_transaction_id, reason);
        }
      } else {
        throw ErrorService.create(ErrorService.CODES.PAYMENT_LEDGER_LINK_MISSING,
          'The payment is missing its linked cash transaction.', null, ErrorService.CATEGORY_CONFLICT);
      }

      RepositoryService.updateById(SheetSchemaService.SHEET_PAYMENTS, paymentId, {
        status: 'VOIDED',
        voided_at: now,
        voided_by: actor.userId,
        void_reason: reason,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });

      var bookingSummary = ReceivableService.refreshBookingCaches(record.booking_id);
      ReceivableService.refreshClientCachedTotals();

      AuditService.info(AuditService.ACTIONS.PAYMENT_VOIDED, 'Payments', paymentId,
        'Voided payment ' + Number(record.amount || 0).toFixed(2) + ' for booking ' + record.booking_id + ' (linked cash transaction voided). Reason: ' + reason + '.');
      return {
        voided: true,
        payment: PaymentRepository.getPayment(paymentId),
        bookingSummary: ReceivableService.getBookingReceivableSummary(record.booking_id)
      };
    });
  }

  function verifyPaymentLedgerLinks() {
    assertDatabase();
    var payments = RepositoryService.readAll(SheetSchemaService.SHEET_PAYMENTS);
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    var txBySource = {};
    for (var t = 0; t < transactions.length; t++) {
      if (String(transactions[t].source_type) === 'PAYMENT' && transactions[t].source_id) {
        txBySource[String(transactions[t].source_id)] = transactions[t];
      }
    }
    var issues = [];
    var checked = 0;
    for (var p = 0; p < payments.length; p++) {
      var pay = payments[p];
      checked++;
      if (!pay.cash_transaction_id) {
        issues.push({ paymentId: pay.payment_id, issue: 'MISSING_LINK' });
        continue;
      }
      var tx = txBySource[String(pay.payment_id)];
      if (!tx) {
        issues.push({ paymentId: pay.payment_id, issue: 'NO_TX_FOR_PAYMENT' });
        continue;
      }
      if (Math.abs(Number(tx.amount || 0) - Number(pay.amount || 0)) > 0.005) {
        issues.push({ paymentId: pay.payment_id, issue: 'AMOUNT_MISMATCH' });
        continue;
      }
      var paymentVoided = String(pay.status) === 'VOIDED';
      var txVoided = String(tx.status) === 'VOIDED';
      if (paymentVoided !== txVoided) {
        issues.push({ paymentId: pay.payment_id, issue: 'VOID_STATE_MISMATCH' });
      }
    }
    return { checked: checked, issues: issues, consistent: issues.length === 0 };
  }

  return {
    recordBookingPayment: recordBookingPayment,
    voidBookingPayment: voidBookingPayment,
    verifyPaymentLedgerLinks: verifyPaymentLedgerLinks,
    TYPES: TYPES.slice(0),
    METHODS: METHODS.slice(0),
    STATUSES: STATUSES.slice(0)
  };
})();
