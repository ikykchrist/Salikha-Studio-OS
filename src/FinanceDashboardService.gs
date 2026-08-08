/**
 * FinanceDashboardService.gs
 * Basic financial summaries for the Cashflow page (Sprint 1 scope).
 *
 * The ledger is the only source. Transfers never inflate inflows or
 * outflows. Owner capital/withdrawals are reported separately from
 * revenue and operating expense. Labels stay honest: this is a cash
 * movement summary, not a full profit calculation.
 */

var FinanceDashboardService = (function () {
  'use strict';

  var NO_TRANSFER_TYPES = {};

  function isTransfer(type) {
    return type === CashTransactionService.TYPE_TRANSFER_IN ||
           type === CashTransactionService.TYPE_TRANSFER_OUT;
  }

  function isOpening(type) {
    return type === CashTransactionService.TYPE_OPENING_BALANCE;
  }

  function summarize(accounts, transactions) {
    var totalCash = 0;
    var byAccount = [];
    var periodInflows = 0;
    var periodOutflows = 0;
    var revenue = 0;
    var operatingExpenses = 0;
    var capitalExpenses = 0;
    var ownerCapital = 0;
    var ownerWithdrawals = 0;
    var adjustmentsIn = 0;
    var adjustmentsOut = 0;

    for (var a = 0; a < accounts.length; a++) {
      var acc = accounts[a];
      var inactive = String(acc.is_active) === 'FALSE' || acc.is_active === false;
      if (inactive) {
        continue;
      }
      var cached = Number(acc.current_balance_cached || 0);
      totalCash += cached;
      byAccount.push({
        accountId: acc.account_id,
        accountName: acc.account_name,
        accountType: acc.account_type,
        currentBalanceCached: cached,
        isActive: true,
        lastUpdated: acc.updated_at || ''
      });
    }

    for (var t = 0; t < transactions.length; t++) {
      var tx = transactions[t];
      if (String(tx.status) === CashTransactionService.STATUS_VOIDED) {
        continue;
      }
      var type = tx.transaction_type;
      var amount = Number(tx.amount || 0);
      if (isTransfer(type) || isOpening(type)) {
        continue; // transfers and opening balances never inflate period movement
      }
      var inflow = String(tx.direction) === CashTransactionService.DIRECTION_INFLOW;
      if (inflow) {
        periodInflows += amount;
      } else {
        periodOutflows += amount;
      }
      switch (type) {
        case CashTransactionService.TYPE_GENERAL_INCOME:
          revenue += amount;
          break;
        case CashTransactionService.TYPE_OPERATING_EXPENSE:
          operatingExpenses += amount;
          break;
        case CashTransactionService.TYPE_CAPITAL_EXPENSE:
          capitalExpenses += amount;
          break;
        case CashTransactionService.TYPE_OWNER_CAPITAL:
          ownerCapital += amount;
          break;
        case CashTransactionService.TYPE_OWNER_WITHDRAWAL:
          ownerWithdrawals += amount;
          break;
        case CashTransactionService.TYPE_ADJUSTMENT_IN:
          adjustmentsIn += amount;
          break;
        case CashTransactionService.TYPE_ADJUSTMENT_OUT:
          adjustmentsOut += amount;
          break;
        default:
          break;
      }
    }

    return {
      totalAvailableCash: totalCash,
      accounts: byAccount,
      periodInflows: periodInflows,
      periodOutflows: periodOutflows,
      netCashMovement: periodInflows - periodOutflows,
      generalRevenue: revenue,
      operatingExpenses: operatingExpenses,
      capitalExpenses: capitalExpenses,
      ownerCapital: ownerCapital,
      ownerWithdrawals: ownerWithdrawals,
      adjustmentsIn: adjustmentsIn,
      adjustmentsOut: adjustmentsOut,
      label: 'Operational result - preliminary',
      note: 'Cash movement summary from posted transactions. Booking revenue, receivables, gross profit, and net income arrive with future sprints.'
    };
  }

  /**
   * Builds the dashboard summary for a period.
   * @param {Object} filters { fromDate, toDate }
   */
  function getDashboardSummary(filters) {
    filters = filters || {};
    var accounts = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);

    var filtered = [];
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (filters.fromDate && String(tx.transaction_date) < String(filters.fromDate)) {
        continue;
      }
      if (filters.toDate && String(tx.transaction_date) > String(filters.toDate)) {
        continue;
      }
      filtered.push(tx);
    }
    var summary = summarize(accounts, filtered);

    var recent = CashTransactionService.listTransactions({ limit: 10 });
    summary.recentTransactions = recent;
    summary.fromDate = filters.fromDate || '';
    summary.toDate = filters.toDate || '';
    summary.generatedAt = DateService.nowIso();
    return summary;
  }

  return {
    getDashboardSummary: getDashboardSummary,
    summarize: summarize
  };
})();
