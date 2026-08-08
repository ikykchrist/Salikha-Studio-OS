/**
 * OpeningBalanceService.gs
 * Opening balance workflow: creates an immutable OPENING_BALANCE
 * transaction and refreshes the account's cached balance atomically.
 *
 * Opening balance is NOT income. It never appears in revenue.
 */

var OpeningBalanceService = (function () {
  'use strict';

  /**
   * Records an opening balance for an account.
   * @param {Object} payload { accountId, amount, openingDate, referenceNumber }
   * @return {Object} { transaction, balanceAfter }
   */
  function recordOpeningBalance(payload) {
    var account = CashAccountService.requireActiveAccount(payload.accountId);

    var amount = Number(payload.amount);
    var amountCheck = ValidationService.isNonNegativeAmount(amount, 'Opening balance');
    if (!amountCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, amountCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }

    var existing = RepositoryService.findByField(SheetSchemaService.SHEET_CASH_TRANSACTIONS, 'account_id', payload.accountId);
    var hasOpening = false;
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i].transaction_type) === 'OPENING_BALANCE' && String(existing[i].status) !== 'VOIDED') {
        hasOpening = true;
        break;
      }
    }
    if (hasOpening) {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'This account already has an opening balance. Use a documented adjustment to correct it.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }

    return LockManager.run(function () {
      var transaction = CashTransactionService.postTransaction({
        transactionType: 'OPENING_BALANCE',
        categoryId: payload.categoryId || null,
        accountId: payload.accountId,
        amount: amount,
        direction: 'INFLOW',
        description: 'Opening balance for account ' + account.account_name + '.',
        referenceNumber: payload.referenceNumber || '',
        sourceType: 'OPENING_BALANCE',
        sourceId: payload.accountId,
        transactionDate: payload.openingDate || DateService.toIsoDate(DateService.now()),
        idempotencyKey: payload.idempotencyKey || ('OPENING-' + payload.accountId)
      });
      var balanceAfter = CashAccountService.recalculateCashAccountBalance(payload.accountId);
      AuditService.info(AuditService.ACTIONS.OPENING_BALANCE_RECORDED, 'CashAccounts', payload.accountId,
        'Recorded opening balance of ' + amount + ' for account ' + account.account_name + '.');
      return { transaction: transaction, balanceAfter: balanceAfter };
    });
  }

  return {
    recordOpeningBalance: recordOpeningBalance
  };
})();
