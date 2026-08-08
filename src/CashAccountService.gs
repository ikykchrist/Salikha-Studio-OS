/**
 * CashAccountService.gs
 * Cash account master data and ledger-derived balances.
 *
 * The ledger (CashTransactions) is the authoritative source of an
 * account's balance. current_balance_cached is a performance cache only.
 */

var CashAccountService = (function () {
  'use strict';

  var TYPE_CASH = 'CASH';
  var TYPE_E_WALLET = 'E_WALLET';
  var TYPE_BANK = 'BANK';
  var TYPE_PETTY_CASH = 'PETTY_CASH';
  var TYPE_OTHER = 'OTHER';

  var TYPES = [TYPE_CASH, TYPE_E_WALLET, TYPE_BANK, TYPE_PETTY_CASH, TYPE_OTHER];

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

  function listAccounts(includeInactive) {
    assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (inactive && !includeInactive) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    return out;
  }

  function getAccountById(accountId) {
    var record = RepositoryService.findById(SheetSchemaService.SHEET_CASH_ACCOUNTS, accountId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function getAccountRecord(accountId) {
    return RepositoryService.findById(SheetSchemaService.SHEET_CASH_ACCOUNTS, accountId);
  }

  /**
   * Requires an account to exist and be active.
   */
  function requireActiveAccount(accountId) {
    var record = getAccountRecord(accountId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.ACCOUNT_NOT_FOUND,
        'The selected cash account does not exist.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    var inactive = String(record.is_active) === 'FALSE' || record.is_active === false;
    if (inactive) {
      throw ErrorService.create(
        ErrorService.CODES.ACCOUNT_INACTIVE,
        'The selected cash account is inactive.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return record;
  }

  function assertUniqueActiveName(name, excludeId) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.account_name).toLowerCase() !== String(name).toLowerCase()) {
        continue;
      }
      if (excludeId && String(r.account_id) === String(excludeId)) {
        continue;
      }
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (!inactive) {
        throw ErrorService.create(
          ErrorService.CODES.VALIDATION_ERROR,
          'An active cash account with this name already exists.',
          null,
          ErrorService.CATEGORY_VALIDATION
        );
      }
    }
  }

  /**
   * Creates a cash account. When an opening balance > 0 is provided, an
   * OPENING_BALANCE transaction is created in the same request.
   */
  function createAccount(payload) {
    assertDatabase();
    var name = ValidationService.trimSafe(payload.accountName);
    var nameCheck = ValidationService.isNonEmptyString(name, 'Account name', 100);
    if (!nameCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(payload.accountType, TYPES, 'Account type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var opening = typeof payload.openingBalance === 'number' ? payload.openingBalance : Number(payload.openingBalance || 0);
    var openingCheck = ValidationService.isNonNegativeAmount(opening, 'Opening balance');
    if (!openingCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, openingCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.openingBalanceDate) {
      var dateCheck = ValidationService.isDate(payload.openingBalanceDate, 'Opening balance date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    assertUniqueActiveName(name);

    var actor = AuditService.getActor();
    var now = DateService.nowIso();
    var openingDate = payload.openingBalanceDate || DateService.toIsoDate(DateService.now());

    return LockManager.run(function () {
      var accountId = IdService.generateId('ACC');
      var account = {
        account_id: accountId,
        account_name: name,
        account_type: payload.accountType,
        institution_name: payload.institutionName || '',
        account_reference: maskReference(payload.accountReference || ''),
        opening_balance: opening,
        opening_balance_date: openingDate,
        current_balance_cached: opening,
        is_active: true,
        notes: payload.notes || '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      };
      RepositoryService.appendRecord(SheetSchemaService.SHEET_CASH_ACCOUNTS, account);

      if (opening > 0) {
        var openingRecord = OpeningBalanceService.recordOpeningBalance({
          accountId: accountId,
          amount: opening,
          openingDate: openingDate,
          referenceNumber: payload.referenceNumber || ''
        });
        account.current_balance_cached = openingRecord.balanceAfter;
        RepositoryService.updateById(SheetSchemaService.SHEET_CASH_ACCOUNTS, accountId, {
          current_balance_cached: openingRecord.balanceAfter,
          updated_at: now,
          updated_by: actor.userId
        });
      }

      AuditService.info(AuditService.ACTIONS.ACCOUNT_CREATED, 'CashAccounts', accountId,
        'Created cash account "' + name + '" (' + payload.accountType + '), opening ' + formatAmount(opening) + '.');
      return getAccountById(accountId);
    });
  }

  /**
   * Masks account references: keeps the last 4 characters only.
   */
  function maskReference(reference) {
    var trimmed = String(reference || '').trim();
    if (!trimmed) {
      return '';
    }
    var cleaned = trimmed.replace(/[\s-]/g, '');
    if (cleaned.length <= 4) {
      return trimmed;
    }
    return '****' + cleaned.substring(cleaned.length - 4);
  }

  function formatAmount(amount) {
    return Config.getBusinessCurrency_() + ' ' + Number(amount).toFixed(2);
  }

  function updateAccount(payload) {
    assertDatabase();
    var accountId = payload.accountId;
    var record = getAccountRecord(accountId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.ACCOUNT_NOT_FOUND, 'The cash account was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var hasTransactions = hasTransactionHistory(accountId);
    var patch = {};
    var changed = [];
    var actor = AuditService.getActor();

    if (payload.accountName !== undefined) {
      var name = ValidationService.trimSafe(payload.accountName);
      var nameCheck = ValidationService.isNonEmptyString(name, 'Account name', 100);
      if (!nameCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
      assertUniqueActiveName(name, accountId);
      patch.account_name = name;
      changed.push('name');
    }
    if (payload.institutionName !== undefined) {
      patch.institution_name = payload.institutionName || '';
      changed.push('institution');
    }
    if (payload.accountReference !== undefined) {
      patch.account_reference = maskReference(payload.accountReference);
      changed.push('reference');
    }
    if (payload.notes !== undefined) {
      patch.notes = payload.notes || '';
      changed.push('notes');
    }
    if (payload.openingBalance !== undefined) {
      if (hasTransactions) {
        throw ErrorService.create(
          ErrorService.CODES.VALIDATION_ERROR,
          'Opening balance cannot be edited after transactions exist. Use a documented adjustment instead.',
          null,
          ErrorService.CATEGORY_VALIDATION
        );
      }
      var opening = Number(payload.openingBalance);
      var openingCheck = ValidationService.isNonNegativeAmount(opening, 'Opening balance');
      if (!openingCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, openingCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
      patch.opening_balance = opening;
      patch.current_balance_cached = opening;
      changed.push('opening balance');
    }
    if (Object.keys(patch).length === 0) {
      return getAccountById(accountId);
    }
    patch.updated_at = DateService.nowIso();
    patch.updated_by = actor.userId;
    patch.version = Number(record.version || 1) + 1;
    RepositoryService.updateById(SheetSchemaService.SHEET_CASH_ACCOUNTS, accountId, patch);
    AuditService.info(AuditService.ACTIONS.ACCOUNT_UPDATED, 'CashAccounts', accountId,
      'Updated account fields: ' + changed.join(', ') + '.');
    return getAccountById(accountId);
  }

  function hasTransactionHistory(accountId) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].account_id) === String(accountId)) {
        return true;
      }
    }
    return false;
  }

  function deactivateAccount(accountId) {
    assertDatabase();
    var record = getAccountRecord(accountId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.ACCOUNT_NOT_FOUND, 'The cash account was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var actor = AuditService.getActor();
    RepositoryService.updateById(SheetSchemaService.SHEET_CASH_ACCOUNTS, accountId, {
      is_active: false,
      updated_at: DateService.nowIso(),
      updated_by: actor.userId,
      version: Number(record.version || 1) + 1
    });
    AuditService.info(AuditService.ACTIONS.ACCOUNT_DEACTIVATED, 'CashAccounts', accountId,
      'Deactivated cash account "' + record.account_name + '". History preserved.');
    return getAccountById(accountId);
  }

  /**
   * Recalculates an account's cached balance from posted transactions.
   * Balance = sum of posted transaction amounts (the opening balance is
   * itself an OPENING_BALANCE transaction; the opening_balance column is
   * informational only). The ledger is authoritative.
   */
  function recalculateCashAccountBalance(accountId) {
    assertDatabase();
    var record = getAccountRecord(accountId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.ACCOUNT_NOT_FOUND, 'The cash account was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var balance = 0;
    var transactions = RepositoryService.findByField(SheetSchemaService.SHEET_CASH_TRANSACTIONS, 'account_id', accountId);
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (String(tx.status) === 'VOIDED') {
        continue;
      }
      var amount = Number(tx.amount || 0);
      if (String(tx.direction) === 'INFLOW') {
        balance += amount;
      } else {
        balance -= amount;
      }
    }
    var actor = AuditService.getActor();
    RepositoryService.updateById(SheetSchemaService.SHEET_CASH_ACCOUNTS, accountId, {
      current_balance_cached: balance,
      updated_at: DateService.nowIso(),
      updated_by: actor.userId
    });
    return balance;
  }

  /**
   * Recalculates cached balances for every account.
   */
  function recalculateAllCashAccountBalances() {
    assertDatabase();
    var accounts = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    var updates = [];
    for (var a = 0; a < accounts.length; a++) {
      var acc = accounts[a];
      var balance = 0;
      for (var t = 0; t < transactions.length; t++) {
        var tx = transactions[t];
        if (String(tx.account_id) !== String(acc.account_id) || String(tx.status) === 'VOIDED') {
          continue;
        }
        var amount = Number(tx.amount || 0);
        if (String(tx.direction) === 'INFLOW') {
          balance += amount;
        } else {
          balance -= amount;
        }
      }
      updates.push({
        id: acc.account_id,
        patch: {
          current_balance_cached: balance,
          updated_at: DateService.nowIso()
        }
      });
    }
    RepositoryService.batchUpdateById(SheetSchemaService.SHEET_CASH_ACCOUNTS, updates);
    return updates.length;
  }

  /**
   * Compares cached vs calculated balances and reports inconsistencies.
   */
  function verifyCashAccountBalances() {
    assertDatabase();
    var accounts = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    var byAccount = {};
    for (var t = 0; t < transactions.length; t++) {
      var tx = transactions[t];
      if (String(tx.status) === 'VOIDED') {
        continue;
      }
      var key = String(tx.account_id);
      if (!byAccount[key]) {
        byAccount[key] = 0;
      }
      var amount = Number(tx.amount || 0);
      if (String(tx.direction) === 'INFLOW') {
        byAccount[key] += amount;
      } else {
        byAccount[key] -= amount;
      }
    }
    var results = [];
    var issues = 0;
    for (var a = 0; a < accounts.length; a++) {
      var acc = accounts[a];
      var calculated = byAccount[String(acc.account_id)] || 0;
      var cached = Number(acc.current_balance_cached || 0);
      var match = Math.abs(calculated - cached) < 0.005;
      if (!match) {
        issues++;
      }
      results.push({
        accountId: acc.account_id,
        accountName: acc.account_name,
        cached: cached,
        calculated: calculated,
        matches: match
      });
    }
    AuditService.warn(AuditService.ACTIONS.BALANCE_VERIFICATION, 'CashAccounts', '',
      'Balance verification completed with ' + issues + ' inconsistency(ies).',
      { metadata: { accountsChecked: results.length, issues: issues } });
    return {
      accountsChecked: results.length,
      inconsistencies: issues,
      results: results
    };
  }

  return {
    listAccounts: listAccounts,
    getAccountById: getAccountById,
    getAccountRecord: getAccountRecord,
    requireActiveAccount: requireActiveAccount,
    createAccount: createAccount,
    updateAccount: updateAccount,
    deactivateAccount: deactivateAccount,
    recalculateCashAccountBalance: recalculateCashAccountBalance,
    recalculateAllCashAccountBalances: recalculateAllCashAccountBalances,
    verifyCashAccountBalances: verifyCashAccountBalances,
    maskReference: maskReference,
    TYPES: TYPES.slice(0),
    TYPE_CASH: TYPE_CASH,
    TYPE_E_WALLET: TYPE_E_WALLET,
    TYPE_BANK: TYPE_BANK,
    TYPE_PETTY_CASH: TYPE_PETTY_CASH,
    TYPE_OTHER: TYPE_OTHER
  };
})();

