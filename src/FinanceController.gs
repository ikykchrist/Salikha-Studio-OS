/**
 * FinanceController.gs
 * Server entry points for the Cashflow interface (Sprint 1).
 *
 * Every function validates payloads, calls the service layer, and
 * returns the standardized response envelope. Stack traces and script
 * properties are never returned.
 */

function getFinanceInitializationStatus() {
  return ErrorService.wrap(function () {
    return ResponseService.success(DatabaseService.getInitializationStatus(), 'Finance initialization status retrieved.');
  })();
}

function initializeDatabase() {
  return ErrorService.wrap(function () {
    var result = DatabaseService.initializeDatabase();
    return ResponseService.success(result, 'Database initialized (schema v' + result.schemaVersion + ').');
  })();
}

function getCashAccounts() {
  return ErrorService.wrap(function () {
    return ResponseService.success(CashAccountService.listAccounts(true), 'Cash accounts retrieved.');
  })();
}

function createCashAccount(payload) {
  return ErrorService.wrap(function () {
    var account = CashAccountService.createAccount(payload || {});
    return ResponseService.success(account, 'Cash account created.');
  })();
}

function updateCashAccount(payload) {
  return ErrorService.wrap(function () {
    var account = CashAccountService.updateAccount(payload || {});
    return ResponseService.success(account, 'Cash account updated.');
  })();
}

function deactivateCashAccount(accountId) {
  return ErrorService.wrap(function () {
    var account = CashAccountService.deactivateAccount(accountId);
    return ResponseService.success(account, 'Cash account deactivated. History preserved.');
  })();
}

function getFinancialCategories() {
  return ErrorService.wrap(function () {
    return ResponseService.success(FinancialCategoryService.listCategories(), 'Financial categories retrieved.');
  })();
}

function createFinancialCategory(payload) {
  return ErrorService.wrap(function () {
    var category = FinancialCategoryService.createCategory(payload || {});
    return ResponseService.success(category, 'Financial category created.');
  })();
}

function updateFinancialCategory(payload) {
  return ErrorService.wrap(function () {
    var category = FinancialCategoryService.updateCategory(payload || {});
    return ResponseService.success(category, 'Financial category updated.');
  })();
}

function recordOpeningBalance(payload) {
  return ErrorService.wrap(function () {
    var result = OpeningBalanceService.recordOpeningBalance(payload || {});
    return ResponseService.success(result, 'Opening balance recorded. Note: opening balance is not revenue.');
  })();
}

function recordGeneralIncome(payload) {
  return ErrorService.wrap(function () {
    var result = CashTransactionService.postTransaction(buildManualPayload(payload, CashTransactionService.TYPE_GENERAL_INCOME));
    return ResponseService.success(result, 'General income posted.');
  })();
}

function recordOperatingExpense(payload) {
  return ErrorService.wrap(function () {
    var result = CashTransactionService.postTransaction(buildManualPayload(payload, CashTransactionService.TYPE_OPERATING_EXPENSE));
    return ResponseService.success(result, 'Operating expense posted.');
  })();
}

function recordCapitalExpense(payload) {
  return ErrorService.wrap(function () {
    var result = CashTransactionService.postTransaction(buildManualPayload(payload, CashTransactionService.TYPE_CAPITAL_EXPENSE));
    return ResponseService.success(result, 'Capital expense posted. It is reported separately from operating expenses.');
  })();
}

function recordOwnerCapital(payload) {
  return ErrorService.wrap(function () {
    var result = CashTransactionService.postTransaction(buildManualPayload(payload, CashTransactionService.TYPE_OWNER_CAPITAL));
    return ResponseService.success(result, 'Owner capital posted. This is not business revenue.');
  })();
}

function recordOwnerWithdrawal(payload) {
  return ErrorService.wrap(function () {
    var result = CashTransactionService.postTransaction(buildManualPayload(payload, CashTransactionService.TYPE_OWNER_WITHDRAWAL));
    return ResponseService.success(result, 'Owner withdrawal posted. This is not an operating expense.');
  })();
}

function buildManualPayload(payload, transactionType) {
  return {
    transactionType: transactionType,
    categoryId: payload.categoryId,
    accountId: payload.accountId,
    amount: payload.amount,
    description: payload.description,
    counterparty: payload.counterparty,
    referenceNumber: payload.referenceNumber,
    transactionDate: payload.transactionDate,
    idempotencyKey: payload.idempotencyKey,
    sourceType: CashTransactionService.SOURCE_MANUAL
  };
}

function recordAccountTransfer(payload) {
  return ErrorService.wrap(function () {
    var result = TransferService.recordTransfer(payload || {});
    return ResponseService.success(result, 'Transfer completed. Total business cash is unchanged.');
  })();
}

function getCashTransactions(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CashTransactionService.listTransactions(filters || {}), 'Cash transactions retrieved.');
  })();
}

function getCashTransaction(transactionId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CashTransactionService.getTransaction(transactionId), 'Cash transaction retrieved.');
  })();
}

function voidCashTransaction(payload) {
  return ErrorService.wrap(function () {
    var result = CashTransactionService.voidTransaction(payload || {});
    return ResponseService.success(result, 'Transaction voided. History preserved.');
  })();
}

function getFinanceDashboardSummary(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(FinanceDashboardService.getDashboardSummary(filters || {}), 'Finance summary retrieved.');
  })();
}

function getDailyReconciliationData(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ReconciliationService.getReconciliationData(payload || {}), 'Reconciliation data retrieved.');
  })();
}

function saveDailyCashReconciliation(payload) {
  return ErrorService.wrap(function () {
    var result = ReconciliationService.saveReconciliation(payload || {});
    return ResponseService.success(result, 'Daily reconciliation saved. The ledger was not adjusted automatically.');
  })();
}

function verifyCashAccountBalances() {
  return ErrorService.wrap(function () {
    return ResponseService.success(CashAccountService.verifyCashAccountBalances(), 'Balance verification completed.');
  })();
}

function developmentResetFinanceData(confirmationText) {
  return ErrorService.wrap(function () {
    var result = DatabaseService.developmentReset(confirmationText);
    return ResponseService.success(result, 'Development finance data reset completed.');
  })();
}
