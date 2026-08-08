/**
 * CashTransactionService.gs
 * The financial ledger - the authoritative source of account balances.
 *
 * Posting, voiding, duplicate protection, and balance recalculation live
 * here. Direction is always derived server-side from the transaction
 * type; client-supplied direction is never trusted.
 */

var CashTransactionService = (function () {
  'use strict';

  var STATUS_POSTED = 'POSTED';
  var STATUS_VOIDED = 'VOIDED';

  var DIRECTION_INFLOW = 'INFLOW';
  var DIRECTION_OUTFLOW = 'OUTFLOW';

  var TYPE_GENERAL_INCOME = 'GENERAL_INCOME';
  var TYPE_OPERATING_EXPENSE = 'OPERATING_EXPENSE';
  var TYPE_CAPITAL_EXPENSE = 'CAPITAL_EXPENSE';
  var TYPE_OWNER_CAPITAL = 'OWNER_CAPITAL';
  var TYPE_OWNER_WITHDRAWAL = 'OWNER_WITHDRAWAL';
  var TYPE_TRANSFER_IN = 'TRANSFER_IN';
  var TYPE_TRANSFER_OUT = 'TRANSFER_OUT';
  var TYPE_OPENING_BALANCE = 'OPENING_BALANCE';
  var TYPE_ADJUSTMENT_IN = 'ADJUSTMENT_IN';
  var TYPE_ADJUSTMENT_OUT = 'ADJUSTMENT_OUT';
  var TYPE_BOOKING_PAYMENT = 'BOOKING_PAYMENT';
  var TYPE_REFUND = 'REFUND';
  var TYPE_EXPENSE = 'EXPENSE';

  var TYPES = [
    TYPE_GENERAL_INCOME,
    TYPE_OPERATING_EXPENSE,
    TYPE_CAPITAL_EXPENSE,
    TYPE_OWNER_CAPITAL,
    TYPE_OWNER_WITHDRAWAL,
    TYPE_TRANSFER_IN,
    TYPE_TRANSFER_OUT,
    TYPE_OPENING_BALANCE,
    TYPE_ADJUSTMENT_IN,
    TYPE_ADJUSTMENT_OUT,
    TYPE_BOOKING_PAYMENT,
    TYPE_REFUND,
    TYPE_EXPENSE
  ];

  var MANUAL_TYPES = [
    TYPE_GENERAL_INCOME,
    TYPE_OPERATING_EXPENSE,
    TYPE_CAPITAL_EXPENSE,
    TYPE_OWNER_CAPITAL,
    TYPE_OWNER_WITHDRAWAL
  ];

  var SOURCE_MANUAL = 'MANUAL';
  var SOURCE_OPENING_BALANCE = 'OPENING_BALANCE';
  var SOURCE_TRANSFER = 'TRANSFER';
  var SOURCE_ADJUSTMENT = 'ADJUSTMENT';
  var SOURCE_SYSTEM = 'SYSTEM';
  var SOURCE_PAYMENT = 'PAYMENT';
  var SOURCE_EXPENSE = 'EXPENSE';
  var SOURCE_CREW = 'CREW';
  var SOURCE_COMMISSION = 'COMMISSION';

  var SOURCE_TYPES = [SOURCE_MANUAL, SOURCE_OPENING_BALANCE, SOURCE_TRANSFER, SOURCE_ADJUSTMENT, SOURCE_SYSTEM, SOURCE_PAYMENT, 'REFUND', SOURCE_EXPENSE, SOURCE_CREW, SOURCE_COMMISSION];

  /**
   * Transaction type to direction. Server-authoritative.
   */
  function directionForType(type) {
    switch (type) {
      case TYPE_GENERAL_INCOME:
      case TYPE_OWNER_CAPITAL:
      case TYPE_TRANSFER_IN:
      case TYPE_OPENING_BALANCE:
      case TYPE_ADJUSTMENT_IN:
      case TYPE_BOOKING_PAYMENT:
        return DIRECTION_INFLOW;
      case TYPE_OPERATING_EXPENSE:
      case TYPE_CAPITAL_EXPENSE:
      case TYPE_OWNER_WITHDRAWAL:
      case TYPE_TRANSFER_OUT:
      case TYPE_ADJUSTMENT_OUT:
      case TYPE_REFUND:
      case TYPE_EXPENSE:
        return DIRECTION_OUTFLOW;
      default:
        return null;
    }
  }

  /**
   * Category type required by a transaction type. Server-authoritative.
   */
  function requiredCategoryType(type) {
    switch (type) {
      case TYPE_GENERAL_INCOME:
        return FinancialCategoryService.TYPE_INCOME;
      case TYPE_OPERATING_EXPENSE:
        return FinancialCategoryService.TYPE_OPERATING_EXPENSE;
      case TYPE_CAPITAL_EXPENSE:
        return FinancialCategoryService.TYPE_CAPITAL_EXPENSE;
      case TYPE_OWNER_CAPITAL:
        return FinancialCategoryService.TYPE_OWNER_CAPITAL;
      case TYPE_OWNER_WITHDRAWAL:
        return FinancialCategoryService.TYPE_OWNER_WITHDRAWAL;
      case TYPE_TRANSFER_IN:
      case TYPE_TRANSFER_OUT:
        return FinancialCategoryService.TYPE_TRANSFER;
      case TYPE_OPENING_BALANCE:
      case TYPE_ADJUSTMENT_IN:
      case TYPE_ADJUSTMENT_OUT:
        return FinancialCategoryService.TYPE_ADJUSTMENT;
      case TYPE_BOOKING_PAYMENT:
        return FinancialCategoryService.TYPE_INCOME;
      case TYPE_REFUND:
        return FinancialCategoryService.TYPE_REFUND;
      case TYPE_EXPENSE:
        return FinancialCategoryService.TYPE_OPERATING_EXPENSE;
      default:
        return null;
    }
  }

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The financial database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
  }

  /**
   * Computes an account's balance from posted transactions only.
   * The opening balance is itself an OPENING_BALANCE transaction, so
   * the ledger sum is complete.
   */
  function calculateAccountBalance(accountId) {
    var account = CashAccountService.getAccountRecord(accountId);
    if (!account) {
      throw ErrorService.create(ErrorService.CODES.ACCOUNT_NOT_FOUND, 'The cash account was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var balance = 0;
    var transactions = RepositoryService.findByField(SheetSchemaService.SHEET_CASH_TRANSACTIONS, 'account_id', accountId);
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (String(tx.status) === STATUS_VOIDED) {
        continue;
      }
      var amount = Number(tx.amount || 0);
      if (String(tx.direction) === DIRECTION_INFLOW) {
        balance += amount;
      } else {
        balance -= amount;
      }
    }
    return balance;
  }

  /**
   * Posts a transaction under a script lock with full validation and
   * duplicate protection.
   */
  function postTransaction(payload) {
    assertDatabase();

    var transactionType = payload.transactionType;
    var typeCheck = ValidationService.isEnum(transactionType, TYPES, 'Transaction type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_TRANSACTION_TYPE, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var direction = directionForType(transactionType);
    if (!direction) {
      throw ErrorService.create(ErrorService.CODES.INVALID_TRANSACTION_TYPE, 'Unknown transaction type.', null, ErrorService.CATEGORY_VALIDATION);
    }

    var amount = Number(payload.amount);
    var amountCheck = transactionType === TYPE_OPENING_BALANCE
      ? ValidationService.isNonNegativeAmount(amount, 'Amount')
      : ValidationService.isPositiveAmount(amount, 'Amount');
    if (!amountCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT, amountCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }

    if (payload.transactionDate) {
      var dateCheck = ValidationService.isDate(payload.transactionDate, 'Transaction date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }

    var category = null;
    if (payload.categoryId) {
      category = FinancialCategoryService.requireActiveCategory(payload.categoryId);
      var requiredType = requiredCategoryType(transactionType);
      var categoryValid = !requiredType || String(category.category_type) === requiredType;
      if (transactionType === TYPE_EXPENSE) {
        categoryValid = String(category.category_type) === FinancialCategoryService.TYPE_OPERATING_EXPENSE ||
          String(category.category_type) === FinancialCategoryService.TYPE_CAPITAL_EXPENSE;
      }
      if (!categoryValid) {
        throw ErrorService.create(
          ErrorService.CODES.VALIDATION_ERROR,
          'Category "' + category.category_name + '" is not valid for this transaction type.',
          null,
          ErrorService.CATEGORY_VALIDATION
        );
      }
    } else {
      category = FinancialCategoryService.getCategoryRecord(findSystemCategoryByType(requiredCategoryType(transactionType)));
      if (!category) {
        throw ErrorService.create(ErrorService.CODES.CATEGORY_NOT_FOUND,
          'No category is available for this transaction type. Create one first.',
          null, ErrorService.CATEGORY_NOT_FOUND);
      }
    }

    var account = CashAccountService.requireActiveAccount(payload.accountId);

    var description = ValidationService.trimSafe(payload.description);
    if (!description) {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'A description is required for this transaction.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }

    var sourceType = payload.sourceType || SOURCE_MANUAL;
    var sourceCheck = ValidationService.isEnum(sourceType, SOURCE_TYPES, 'Source type');
    if (!sourceCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, sourceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }

    return LockManager.run(function () {
      var idempotencyKey = payload.idempotencyKey || ('TX-' + IdService.generateRaw());
      var existing = findByKey(idempotencyKey);
      if (existing) {
        return { duplicate: true, transaction: RepositoryService.toPublicRecord(existing) };
      }

      if (direction === DIRECTION_OUTFLOW) {
        var balance = calculateAccountBalance(payload.accountId);
        if (balance + 0.005 < amount) {
          throw ErrorService.create(
            ErrorService.CODES.INSUFFICIENT_FUNDS,
            'Insufficient funds. The account balance (' + Number(balance).toFixed(2) + ') is less than the amount (' + Number(amount).toFixed(2) + ').',
            null,
            ErrorService.CATEGORY_CONFLICT
          );
        }
      }

      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var transaction = {
        transaction_id: IdService.generateId('TXN'),
        transaction_date: payload.transactionDate || DateService.toIsoDate(DateService.now()),
        transaction_datetime: now,
        transaction_type: transactionType,
        category_id: category.category_id,
        account_id: payload.accountId,
        counterparty: payload.counterparty || '',
        amount: amount,
        direction: direction,
        description: description,
        reference_number: payload.referenceNumber || '',
        source_type: sourceType,
        source_id: payload.sourceId || '',
        transfer_group_id: payload.transferGroupId || '',
        status: STATUS_POSTED,
        voided_at: '',
        voided_by: '',
        void_reason: '',
        correction_of_transaction_id: payload.correctionOfTransactionId || '',
        idempotency_key: idempotencyKey,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      };
      RepositoryService.appendRecord(SheetSchemaService.SHEET_CASH_TRANSACTIONS, transaction);

      var balanceAfter = CashAccountService.recalculateCashAccountBalance(payload.accountId);
      AuditService.info(AuditService.ACTIONS.TRANSACTION_POSTED, 'CashTransactions', transaction.transaction_id,
        'Posted ' + transactionType + ' ' + Number(amount).toFixed(2) + ' to ' + account.account_name + '.');
      return { duplicate: false, transaction: RepositoryService.toPublicRecord(transaction), balanceAfter: balanceAfter };
    });
  }

  /**
   * Finds a system category of a given type by name; falls back to the
   * first active category of that type.
   */
  function findSystemCategoryByType(categoryType) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    var fallback = null;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.category_type) !== categoryType) {
        continue;
      }
      if (fallback === null) {
        fallback = r.category_id;
      }
      var system = r.is_system === true || String(r.is_system) === 'TRUE';
      var active = r.is_active === true || String(r.is_active) !== 'FALSE';
      if (system && active) {
        return r.category_id;
      }
    }
    return fallback;
  }

  function findByKey(idempotencyKey) {
    if (!idempotencyKey) {
      return null;
    }
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].idempotency_key) === String(idempotencyKey)) {
        return records[i];
      }
    }
    return null;
  }

  function getTransaction(transactionId) {
    assertDatabase();
    var record = RepositoryService.findById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, transactionId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.TRANSACTION_NOT_FOUND,
        'The transaction was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var publicRecord = RepositoryService.toPublicRecord(record);
    publicRecord.transferPair = null;
    if (record.transfer_group_id) {
      var pair = RepositoryService.findByField(SheetSchemaService.SHEET_CASH_TRANSACTIONS, 'transfer_group_id', record.transfer_group_id);
      var pairList = [];
      for (var i = 0; i < pair.length; i++) {
        if (String(pair[i].transaction_id) !== String(transactionId)) {
          pairList.push(RepositoryService.toPublicRecord(pair[i]));
        }
      }
      publicRecord.transferPair = pairList;
    }
    return publicRecord;
  }

  /**
   * Lists transactions with optional filters. Defaults to the latest 50.
   */
  function listTransactions(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (filters.accountId && String(r.account_id) !== String(filters.accountId)) {
        continue;
      }
      if (filters.transactionType && String(r.transaction_type) !== String(filters.transactionType)) {
        continue;
      }
      if (filters.status && String(r.status) !== String(filters.status)) {
        continue;
      }
      if (filters.fromDate && String(r.transaction_date) < String(filters.fromDate)) {
        continue;
      }
      if (filters.toDate && String(r.transaction_date) > String(filters.toDate)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      var dateDiff = String(b.transaction_date).localeCompare(String(a.transaction_date));
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    var limit = Number(filters.limit) || 50;
    return out.slice(0, limit);
  }

  /**
   * Voids a posted transaction. Requires a reason. Transfers are voided
   * as a pair via TransferService. Cash transactions owned by a payment
   * or refund must be voided through their own workflows.
   */
  function voidTransaction(payload) {
    assertDatabase();
    var transactionId = payload.transactionId;
    var reason = ValidationService.trimSafe(payload.voidReason);
    var reasonCheck = ValidationService.isNonEmptyString(reason, 'Void reason', 300);
    if (!reasonCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, reasonCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }

    var record = RepositoryService.findById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, transactionId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.TRANSACTION_NOT_FOUND,
        'The transaction was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (String(record.source_type) === SOURCE_PAYMENT) {
      throw ErrorService.create(ErrorService.CODES.PAYMENT_VOID_REQUIRED,
        'This cash transaction belongs to a payment. Void the payment from the Payments interface.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.source_type) === 'REFUND') {
      throw ErrorService.create(ErrorService.CODES.REFUND_NOT_ALLOWED,
        'This cash transaction belongs to a refund. Void the refund from the Payments interface.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.source_type) === SOURCE_EXPENSE) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_VOID_REQUIRED,
        'This cash transaction belongs to an expense. Void the expense from the Expenses interface.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.source_type) === SOURCE_CREW) {
      throw ErrorService.create(ErrorService.CODES.CREW_PAYMENT_VOID_REQUIRED,
        'This cash transaction belongs to a crew payment. Void the crew payment from the Crew interface.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.source_type) === SOURCE_COMMISSION) {
      throw ErrorService.create(ErrorService.CODES.COMMISSION_VOID_REQUIRED,
        'This cash transaction belongs to a partner commission. Void the commission from the Partners interface.',
        null, ErrorService.CATEGORY_CONFLICT);
    }
    return voidTransactionInternal(transactionId, reason);
  }

  /**
   * Internal void used by payment/refund workflows after their own
   * validation. Does not route back to the payment workflows.
   */
  function voidTransactionInternal(transactionId, reason) {
    return LockManager.run(function () {
      var record = RepositoryService.findById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, transactionId);
      if (!record) {
        throw ErrorService.create(ErrorService.CODES.TRANSACTION_NOT_FOUND,
          'The transaction was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
      }
      if (String(record.status) === STATUS_VOIDED) {
        throw ErrorService.create(
          ErrorService.CODES.TRANSACTION_ALREADY_VOIDED,
          'This transaction is already voided.',
          null,
          ErrorService.CATEGORY_CONFLICT
        );
      }
      if (record.transfer_group_id) {
        return TransferService.voidTransferPair(record.transfer_group_id, reason);
      }

      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, transactionId, {
        status: STATUS_VOIDED,
        voided_at: now,
        voided_by: actor.userId,
        void_reason: reason,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      var balanceAfter = CashAccountService.recalculateCashAccountBalance(record.account_id);
      AuditService.info(AuditService.ACTIONS.TRANSACTION_VOIDED, 'CashTransactions', transactionId,
        'Voided transaction ' + record.transaction_type + ' (' + Number(record.amount).toFixed(2) + '). Reason: ' + reason + '.');
      return { voided: true, transaction: getTransaction(transactionId), balanceAfter: balanceAfter };
    });
  }

  return {
    postTransaction: postTransaction,
    voidTransaction: voidTransaction,
    voidTransactionInternal: voidTransactionInternal,
    getTransaction: getTransaction,
    listTransactions: listTransactions,
    calculateAccountBalance: calculateAccountBalance,
    directionForType: directionForType,
    requiredCategoryType: requiredCategoryType,
    STATUS_POSTED: STATUS_POSTED,
    STATUS_VOIDED: STATUS_VOIDED,
    DIRECTION_INFLOW: DIRECTION_INFLOW,
    DIRECTION_OUTFLOW: DIRECTION_OUTFLOW,
    TYPE_GENERAL_INCOME: TYPE_GENERAL_INCOME,
    TYPE_OPERATING_EXPENSE: TYPE_OPERATING_EXPENSE,
    TYPE_CAPITAL_EXPENSE: TYPE_CAPITAL_EXPENSE,
    TYPE_OWNER_CAPITAL: TYPE_OWNER_CAPITAL,
    TYPE_OWNER_WITHDRAWAL: TYPE_OWNER_WITHDRAWAL,
    TYPE_TRANSFER_IN: TYPE_TRANSFER_IN,
    TYPE_TRANSFER_OUT: TYPE_TRANSFER_OUT,
    TYPE_OPENING_BALANCE: TYPE_OPENING_BALANCE,
    TYPE_ADJUSTMENT_IN: TYPE_ADJUSTMENT_IN,
    TYPE_ADJUSTMENT_OUT: TYPE_ADJUSTMENT_OUT,
    TYPE_BOOKING_PAYMENT: TYPE_BOOKING_PAYMENT,
    TYPE_REFUND: TYPE_REFUND,
    TYPE_EXPENSE: TYPE_EXPENSE,
    TYPES: TYPES.slice(0),
    MANUAL_TYPES: MANUAL_TYPES.slice(0),
    SOURCE_TYPES: SOURCE_TYPES.slice(0),
    SOURCE_MANUAL: SOURCE_MANUAL,
    SOURCE_OPENING_BALANCE: SOURCE_OPENING_BALANCE,
    SOURCE_TRANSFER: SOURCE_TRANSFER,
    SOURCE_ADJUSTMENT: SOURCE_ADJUSTMENT,
    SOURCE_SYSTEM: SOURCE_SYSTEM,
    SOURCE_PAYMENT: SOURCE_PAYMENT,
    SOURCE_EXPENSE: SOURCE_EXPENSE,
    SOURCE_CREW: SOURCE_CREW,
    SOURCE_COMMISSION: SOURCE_COMMISSION
  };
})();
