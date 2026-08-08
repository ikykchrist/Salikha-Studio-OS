/**
 * ExpenseService.gs
 * Expense lifecycle (Sprint 4): capture, approval, payment, voiding,
 * direct-cost tagging, and the cash effect of paid expenses.
 *
 * Only a PAID expense mints exactly one EXPENSE cash transaction
 * (negative netAmount, VERIFIED, counterparty EXPENSE). APPOROVAL
 * never touches cash. netAmount = grossAmount - taxAmount, computed
 * server-side. Financial records are never physically deleted.
 */

var ExpenseService = (function () {
  'use strict';

  var COST_TYPES = ['DIRECT', 'OPERATING', 'CAPITAL', 'OTHER'];

  var STATUS_DRAFT = 'DRAFT';
  var STATUS_SUBMITTED = 'SUBMITTED';
  var STATUS_APPROVED = 'APPROVED';
  var STATUS_REJECTED = 'REJECTED';
  var STATUS_PAID = 'PAID';

  var STATUSES = [STATUS_DRAFT, STATUS_SUBMITTED, STATUS_APPROVED, STATUS_REJECTED, STATUS_PAID];

  var PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'E_WALLET', 'CHEQUE'];

  /**
   * Cost-bucket mapping for direct costs (booked to BookingCosts).
   * Keyed by the category name as it appears in FinancialCategories,
   * so there is no duplicate category table. Everything else falls to
   * "other direct".
   */
  var DIRECT_COST_BUCKETS = {
    'Transportation': 'transport',
    'Crew Meals': 'meals',
    'General Supplies': 'other',
    'Office Supplies': 'other',
    'Marketing': 'other',
    'Miscellaneous Operating Expense': 'other'
  };

  /**
   * Category names that are system OPERATING expenses (never attached to
   * a booking). Used to assemble the operating allocation pool.
   */
  var OPERATING_EXPENSE_CATEGORY_NAMES = [
    'Electricity', 'Internet', 'Software', 'Repairs and Maintenance',
    'Rent', 'Permits and Fees', 'Marketing', 'Office Supplies',
    'General Supplies'
  ];

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
   * Resolves a category for a paid expense when the expense itself has
   * none: CAPITAL uses the capital expense category; everything else
   * uses the first active operating expense category. Server-side only.
   */
  function resolveExpenseCategoryId(costType) {
    var targetType = costType === 'CAPITAL'
      ? FinancialCategoryService.TYPE_CAPITAL_EXPENSE
      : FinancialCategoryService.TYPE_OPERATING_EXPENSE;
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.category_type) !== targetType) {
        continue;
      }
      var active = r.is_active === true || String(r.is_active) !== 'FALSE';
      if (active) {
        return r.category_id;
      }
    }
    return null;
  }

  function requireExpense(expenseId) {
    var record = ExpenseRepository.findExpenseById(expenseId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_NOT_FOUND, 'The expense was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function getCategory(record) {
    if (!record.category_id) {
      return null;
    }
    return FinancialCategoryService.requireActiveCategory(record.category_id);
  }

  /**
   * Pure price: net = gross - tax. Server-authoritative.
   */
  function computeNetAmount(grossAmount, taxAmount) {
    var gross = BookingPricingService.round2(Number(grossAmount || 0));
    var tax = BookingPricingService.round2(Number(taxAmount || 0));
    return BookingPricingService.round2(gross - tax);
  }

  /**
   * Validates a costType + bookingId pairing and a DRAFT-only edit gate.
   */
  function validateCostType(costType, bookingId) {
    var check = ValidationService.isEnum(costType, COST_TYPES, 'Cost type');
    if (!check.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, check.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (costType === 'DIRECT' && !bookingId) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_DIRECT_BOOKING_REQUIRED,
        'A direct cost must be tagged to a booking (bookingId is required).', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (costType !== 'DIRECT' && bookingId) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_OPERATING_CANNOT_LINK,
        'Only direct expenses can be tagged to a booking.', null, ErrorService.CATEGORY_VALIDATION);
    }
  }

  function validateDate(expenseDate) {
    if (!expenseDate) {
      return;
    }
    var check = ValidationService.isDate(expenseDate, 'Expense date');
    if (!check.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, check.message, null, ErrorService.CATEGORY_VALIDATION);
    }
  }

  /**
   * Creates a DRAFT expense. Never touches cash.
   */
  function createExpense(payload) {
    assertDatabase();
    var costType = payload.costType || 'OPERATING';
    var bookingId = ValidationService.trimSafe(payload.bookingId);
    validateCostType(costType, bookingId);
    validateDate(payload.expenseDate);

    var gross = BookingPricingService.round2(Number(payload.grossAmount || 0));
    var tax = BookingPricingService.round2(Number(payload.taxAmount || 0));
    var grossCheck = ValidationService.isNonNegativeAmount(gross, 'Gross amount');
    var taxCheck = ValidationService.isNonNegativeAmount(tax, 'Tax amount');
    if (!grossCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT, grossCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!taxCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT, taxCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (bookingId && !BookingRepository.findById(bookingId)) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The tagged booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var description = ValidationService.trimSafe(payload.description);
    if (!description) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A description is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var categoryId = payload.categoryId ? ValidationService.trimSafe(payload.categoryId) : '';
    if (categoryId) {
      FinancialCategoryService.requireActiveCategory(categoryId);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      if (payload.idempotencyKey) {
        var existing = RepositoryService.findByField(ExpenseRepository.SHEET_EXPENSES, 'idempotency_key', payload.idempotencyKey);
        if (existing.length > 0) {
          return { duplicate: true, expense: ExpenseRepository.getExpense(existing[0].expense_id) };
        }
      }

      var expenseId = IdService.generateId('EXP');
      var net = computeNetAmount(gross, tax);
      var record = {
        expense_id: expenseId,
        expense_code: expenseId,
        expense_date: payload.expenseDate || DateService.toIsoDate(DateService.now()),
        category_id: categoryId || '',
        description: description,
        gross_amount: gross,
        tax_amount: tax,
        net_amount: net,
        supplier_name: ValidationService.trimSafe(payload.supplierName),
        booking_id: bookingId || '',
        cost_type: costType,
        approval_status: STATUS_DRAFT,
        submitted_at: '',
        approved_by: '',
        approved_at: '',
        rejected_reason: '',
        paid_from_account_id: '',
        paid_at: '',
        payment_method: '',
        receipt_file_id: '',
        cash_transaction_id: '',
        idempotency_key: payload.idempotencyKey || '',
        voided_at: '',
        voided_by: '',
        void_reason: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      };
      RepositoryService.appendRecord(ExpenseRepository.SHEET_EXPENSES, record);
      AuditService.info(AuditService.ACTIONS.EXPENSE_CREATED, 'Expenses', expenseId,
        'Created ' + costType + ' expense ' + Number(net).toFixed(2) + ' ("' + description + '").',
        { metadata: { costType: costType, bookingId: bookingId } });
      return ExpenseRepository.getExpense(expenseId);
    }, 'expense-create');
  }

  /**
   * Edits a DRAFT expense. No cash is ever touched here.
   */
  function updateExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    if (String(record.approval_status) !== STATUS_DRAFT) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_INVALID_STATUS_TRANSITION,
        'Only draft expenses can be edited.', null, ErrorService.CATEGORY_CONFLICT);
    }

    var costType = payload.costType || record.cost_type;
    var bookingId = payload.bookingId !== undefined
      ? ValidationService.trimSafe(payload.bookingId)
      : (record.booking_id || '');
    validateCostType(costType, bookingId);
    validateDate(payload.expenseDate || record.expense_date);

    var gross = payload.grossAmount !== undefined
      ? BookingPricingService.round2(Number(payload.grossAmount))
      : Number(record.gross_amount || 0);
    var tax = payload.taxAmount !== undefined
      ? BookingPricingService.round2(Number(payload.taxAmount))
      : Number(record.tax_amount || 0);
    if (!ValidationService.isNonNegativeAmount(gross, 'Gross amount').valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT,
        ValidationService.isNonNegativeAmount(gross, 'Gross amount').message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!ValidationService.isNonNegativeAmount(tax, 'Tax amount').valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT,
        ValidationService.isNonNegativeAmount(tax, 'Tax amount').message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (bookingId && !BookingRepository.findById(bookingId)) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The tagged booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var description = payload.description !== undefined
      ? ValidationService.trimSafe(payload.description)
      : (record.description || '');
    if (!description) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A description is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var categoryId = payload.categoryId !== undefined
      ? (payload.categoryId ? ValidationService.trimSafe(payload.categoryId) : '')
      : (record.category_id || '');
    if (categoryId) {
      FinancialCategoryService.requireActiveCategory(categoryId);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var net = computeNetAmount(gross, tax);
      RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
        expense_date: payload.expenseDate || record.expense_date,
        category_id: categoryId,
        description: description,
        gross_amount: gross,
        tax_amount: tax,
        net_amount: net,
        supplier_name: payload.supplierName !== undefined
          ? ValidationService.trimSafe(payload.supplierName)
          : (record.supplier_name || ''),
        booking_id: bookingId,
        cost_type: costType,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EXPENSE_UPDATED, 'Expenses', expenseId,
        'Updated draft expense (net ' + Number(net).toFixed(2) + ').');
      return ExpenseRepository.getExpense(expenseId);
    }, 'expense-update');
  }

  /**
   * DRAFT -> SUBMITTED. Only the creator may submit; cash untouched.
   */
  function submitExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    if (String(record.approval_status) !== STATUS_DRAFT) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_INVALID_STATUS_TRANSITION,
        'Only draft expenses can be submitted.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
        approval_status: STATUS_SUBMITTED,
        submitted_at: now,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EXPENSE_SUBMITTED, 'Expenses', expenseId,
        'Submitted expense for approval.');
      return ExpenseRepository.getExpense(expenseId);
    }, 'expense-submit');
  }

  /**
   * SUBMITTED -> APPROVED. Approver identity recorded for the
   * separation-of-duties check at payment time.
   */
  function approveExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    if (String(record.approval_status) !== STATUS_SUBMITTED) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_INVALID_STATUS_TRANSITION,
        'Only submitted expenses can be approved.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
        approval_status: STATUS_APPROVED,
        approved_by: actor.userId,
        approved_at: now,
        rejected_reason: '',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EXPENSE_APPROVED, 'Expenses', expenseId,
        'Approved expense (net ' + Number(record.net_amount || 0).toFixed(2) + '). Approval does not move cash.');
      return ExpenseRepository.getExpense(expenseId);
    }, 'expense-approve');
  }

  /**
   * SUBMITTED -> REJECTED. Reason required. REJECTED -> DRAFT rework.
   */
  function rejectExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    if (String(record.approval_status) !== STATUS_SUBMITTED) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_INVALID_STATUS_TRANSITION,
        'Only submitted expenses can be rejected.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var reason = ValidationService.trimSafe(payload.reason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_SUBMIT_REASON_REQUIRED,
        'A rejection reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
        approval_status: STATUS_REJECTED,
        rejected_reason: reason,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EXPENSE_REJECTED, 'Expenses', expenseId,
        'Rejected expense. Reason: ' + reason + '.');
      return ExpenseRepository.getExpense(expenseId);
    }, 'expense-reject');
  }

  /**
   * REJECTED -> DRAFT (rework). Reason optional; audit trails the move.
   */
  function reopenExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    if (String(record.approval_status) !== STATUS_REJECTED) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_INVALID_STATUS_TRANSITION,
        'Only rejected expenses can be reopened for rework.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
        approval_status: STATUS_DRAFT,
        rejected_reason: '',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.EXPENSE_UPDATED, 'Expenses', expenseId,
        'Reopened rejected expense for rework.');
      return ExpenseRepository.getExpense(expenseId);
    }, 'expense-reopen');
  }

  /**
   * APPROVED -> PAID. Mints exactly one EXPENSE cash transaction
   * (negative netAmount, VERIFIED, counterparty EXPENSE) on the chosen
   * account, atomically with the status change. Separation of duties:
   * the payer may not be the approver (owner exempt at this stage).
   */
  function payExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    if (String(record.approval_status) !== STATUS_APPROVED) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_PAY_REQUIRES_APPROVAL,
        'Only approved expenses can be paid.', null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.approval_status) === 'PAID') {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_ALREADY_PAID,
        'This expense is already paid.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var method = ValidationService.trimSafe(payload.paymentMethod) || 'CASH';
    var methodCheck = ValidationService.isEnum(method, PAYMENT_METHODS, 'Payment method');
    if (!methodCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, methodCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!payload.cashAccountId) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A paid-from account is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    CashAccountService.requireActiveAccount(payload.cashAccountId);
    if (record.cash_transaction_id) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_ALREADY_PAID,
        'This expense already has a linked cash transaction.', null, ErrorService.CATEGORY_CONFLICT);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();

      // Separation of duties: the same non-owner may not both approve and pay.
      if (record.approved_by && String(record.approved_by) !== '' &&
        String(record.approved_by) === String(actor.userId)) {
        throw ErrorService.create(ErrorService.CODES.EXPENSE_APPROVER_CONFLICT,
          'The approver and the payer must be different people.',
          null, ErrorService.CATEGORY_CONFLICT);
      }

      var categoryId = record.category_id ||
        resolveExpenseCategoryId(String(record.cost_type));
      var netAmount = Number(record.net_amount || 0);
      var description = 'Expense paid: ' + (record.description || record.expense_code) +
        ' (' + record.expense_code + ').';

      // 1. Cash outflow first (validates account/category/funds).
      var posted = CashTransactionService.postTransaction({
        transactionType: CashTransactionService.TYPE_EXPENSE,
        categoryId: categoryId,
        accountId: payload.cashAccountId,
        amount: netAmount,
        description: description,
        referenceNumber: '',
        sourceType: CashTransactionService.SOURCE_EXPENSE,
        sourceId: 'PENDING',
        transactionDate: payload.paidDate || record.expense_date || DateService.toIsoDate(DateService.now())
      });
      if (posted.duplicate) {
        throw ErrorService.create(ErrorService.CODES.DUPLICATE_TRANSACTION,
          'A duplicate cash transaction was detected. No expense payment was created.',
          null, ErrorService.CATEGORY_CONFLICT);
      }

      try {
        // 2. Mark the expense PAID and link the cash transaction.
        var now = DateService.nowIso();
        RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
          approval_status: STATUS_PAID,
          paid_from_account_id: payload.cashAccountId,
          paid_at: now,
          payment_method: method,
          cash_transaction_id: posted.transaction.transactionId,
          updated_at: now,
          updated_by: actor.userId,
          version: Number(record.version || 1) + 1
        });

        // 3. Link the expense id into the cash transaction source.
        RepositoryService.updateById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, posted.transaction.transactionId, {
          source_id: expenseId
        });

        // 4. Direct costs flow into booking profitability. Paying an
        // OPERATING expense alters the allocation pool for the month, so
        // the affected month's bookings are recalculated too.
        var bookingSummary = null;
        if (String(record.cost_type) === 'DIRECT' && record.booking_id) {
          bookingSummary = BookingProfitService.recalculateBookingProfitability(record.booking_id);
        } else if (String(record.cost_type) === 'OPERATING') {
          bookingSummary = BookingProfitService.recalculateForMonth(String(record.expense_date || ''));
        }

        AuditService.info(AuditService.ACTIONS.EXPENSE_PAID, 'Expenses', expenseId,
          'Paid ' + Number(netAmount).toFixed(2) + ' from ' + payload.cashAccountId +
          '. Linked cash transaction ' + posted.transaction.transactionId + '.');
        return {
          expense: ExpenseRepository.getExpense(expenseId),
          cashTransaction: posted.transaction,
          bookingSummary: bookingSummary
        };
      } catch (e) {
        try {
          CashTransactionService.voidTransactionInternal(posted.transaction.transactionId,
            'Compensating void: expense pay record failed.');
        } catch (ignored) {
          /* best effort */
        }
        throw e;
      }
    }, 'expense-pay');
  }

  /**
   * Voids a PAID expense together with its linked cash transaction.
   * Reverts direct costs from booking profitability.
   */
  function voidExpense(payload) {
    assertDatabase();
    var expenseId = payload.expenseId;
    var record = requireExpense(expenseId);
    var reason = ValidationService.trimSafe(payload.voidReason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A void reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (record.voided_at && String(record.voided_at) !== '') {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_ALREADY_VOIDED,
        'This expense is already voided.', null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.approval_status) === STATUS_PAID && !record.cash_transaction_id) {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_LEDGER_LINK_MISSING,
        'The expense is paid but missing its linked cash transaction.',
        null, ErrorService.CATEGORY_CONFLICT);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      if (record.cash_transaction_id) {
        var txRecord = RepositoryService.findById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, record.cash_transaction_id);
        if (txRecord && String(txRecord.status) !== 'VOIDED') {
          CashTransactionService.voidTransactionInternal(record.cash_transaction_id, reason);
        }
      }

      RepositoryService.updateById(ExpenseRepository.SHEET_EXPENSES, expenseId, {
        voided_at: now,
        voided_by: actor.userId,
        void_reason: reason,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });

      if (String(record.cost_type) === 'DIRECT' && record.booking_id) {
        BookingProfitService.recalculateBookingProfitability(record.booking_id);
      } else if (String(record.cost_type) === 'OPERATING') {
        BookingProfitService.recalculateForMonth(String(record.expense_date || ''));
      }

      AuditService.info(AuditService.ACTIONS.EXPENSE_VOIDED, 'Expenses', expenseId,
        'Voided expense. Reason: ' + reason + '. Cash effect reversed.');
      return { voided: true, expense: ExpenseRepository.getExpense(expenseId) };
    }, 'expense-void');
  }

  /**
   * Summary strip for the Expenses screen: counts and totals per status.
   */
  function getExpenseSummary() {
    assertDatabase();
    var records = RepositoryService.readAll(ExpenseRepository.SHEET_EXPENSES);
    var counts = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, PAID: 0 };
    var totals = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, PAID: 0 };
    var directCount = 0;
    var directTotal = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var status = String(r.approval_status || '');
      if (counts[status] === undefined) {
        continue;
      }
      counts[status]++;
      totals[status] = BookingPricingService.round2(totals[status] + Number(r.net_amount || 0));
      if (String(r.cost_type) === 'DIRECT') {
        directCount++;
        directTotal = BookingPricingService.round2(directTotal + Number(r.net_amount || 0));
      }
    }
    return {
      counts: counts,
      totals: totals,
      directCount: directCount,
      directTotal: directTotal,
      totalCount: records.length
    };
  }

  return {
    assertDatabase: assertDatabase,
    requireExpense: requireExpense,
    getCategory: getCategory,
    computeNetAmount: computeNetAmount,
    createExpense: createExpense,
    updateExpense: updateExpense,
    submitExpense: submitExpense,
    approveExpense: approveExpense,
    rejectExpense: rejectExpense,
    reopenExpense: reopenExpense,
    payExpense: payExpense,
    voidExpense: voidExpense,
    getExpenseSummary: getExpenseSummary,
    COST_TYPES: COST_TYPES.slice(0),
    STATUSES: STATUSES.slice(0),
    STATUS_DRAFT: STATUS_DRAFT,
    STATUS_SUBMITTED: STATUS_SUBMITTED,
    STATUS_APPROVED: STATUS_APPROVED,
    STATUS_REJECTED: STATUS_REJECTED,
    STATUS_PAID: STATUS_PAID,
    PAYMENT_METHODS: PAYMENT_METHODS.slice(0),
    DIRECT_COST_BUCKETS: DIRECT_COST_BUCKETS,
    OPERATING_EXPENSE_CATEGORY_NAMES: OPERATING_EXPENSE_CATEGORY_NAMES.slice(0)
  };
})();