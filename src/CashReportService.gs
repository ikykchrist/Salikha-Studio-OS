/**
 * CashReportService.gs
 * Cash reports from the ledger - the only financial source of truth
 * (Sprint 7).
 *
 * R2   Cashflow Report (per account + total cash movement)
 * R15  Daily Cash Reconciliation
 * R16  Cash Conversion Summary
 *
 * Every figure is computed from POSTED (non-VOIDED) cash transactions
 * keyed to their cash account. Transfers are dual-sided and never
 * inflate period inflows/outflows. Opening balances are ledger
 * transactions, so an account's "opening" at the start of a period is
 * the sum of all its posted transactions dated before the period.
 */

var CashReportService = (function () {
  'use strict';

  function posted(tx) {
    return String(tx.status) !== CashTransactionService.STATUS_VOIDED;
  }

  function inPeriod(tx, from, to) {
    return String(tx.transaction_date || '') >= from && String(tx.transaction_date || '') <= to;
  }

  function isTransfer(type) {
    return type === CashTransactionService.TYPE_TRANSFER_IN ||
           type === CashTransactionService.TYPE_TRANSFER_OUT;
  }

  function isOpening(type) {
    return type === CashTransactionService.TYPE_OPENING_BALANCE;
  }

  function signedAmount(tx, direction) {
    if (String(tx.direction) === String(direction)) {
      return Number(tx.amount || 0);
    }
    return 0;
  }

  /* ------------------------------------------------------------------ */

  /**
   * R2 - Cashflow report.
   * @param {Object} filters { fromDate, toDate, accountId }
   * @return {Object} { rows, totals, columns, scope, notes }
   */
  function runCashflow(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var accounts = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);

    var accountFilter = filters.accountId ? String(filters.accountId) : '';

    var byAccount = {};
    var rows = [];

    var totalOpening = 0;
    var totalInflows = 0;
    var totalOutflows = 0;
    var totalTransfersIn = 0;
    var totalTransfersOut = 0;
    var totalClosing = 0;

    for (var i = 0; i < accounts.length; i++) {
      var acc = accounts[i];
      if (accountFilter && String(acc.account_id) !== accountFilter) {
        continue;
      }
      var row = {
        accountId: acc.account_id,
        accountName: acc.account_name,
        accountType: acc.account_type,
        opening: 0,
        inflows: 0,
        outflows: 0,
        transfersIn: 0,
        transfersOut: 0,
        closing: 0,
        netMovement: 0
      };
      byAccount[String(acc.account_id)] = row;
      rows.push(row);
    }

    for (var t = 0; t < transactions.length; t++) {
      var tx = transactions[t];
      if (!posted(tx)) {
        continue;
      }
      var row = byAccount[String(tx.account_id)];
      if (!row) {
        continue;
      }
      var txDate = String(tx.transaction_date || '');
      var type = tx.transaction_type;
      if (txDate < from) {
        row.opening += signedAmount(tx, CashTransactionService.DIRECTION_INFLOW) -
                       signedAmount(tx, CashTransactionService.DIRECTION_OUTFLOW);
        continue;
      }
      if (txDate > to) {
        continue;
      }
      var inflow = signedAmount(tx, CashTransactionService.DIRECTION_INFLOW);
      var outflow = signedAmount(tx, CashTransactionService.DIRECTION_OUTFLOW);
      if (isTransfer(type)) {
        if (type === CashTransactionService.TYPE_TRANSFER_IN) {
          row.transfersIn += inflow;
        } else {
          row.transfersOut += outflow;
        }
      } else if (!isOpening(type)) {
        row.inflows += inflow;
        row.outflows += outflow;
      }
      row.closing += inflow - outflow;
    }

    var outRows = [];
    for (var r = 0; r < rows.length; r++) {
      var rr = rows[r];
      rr.closing = ReportFilterService.round2(rr.opening + rr.closing);
      rr.netMovement = ReportFilterService.round2(rr.inflows - rr.outflows + rr.transfersIn - rr.transfersOut);
      rr.opening = ReportFilterService.round2(rr.opening);
      rr.inflows = ReportFilterService.round2(rr.inflows);
      rr.outflows = ReportFilterService.round2(rr.outflows);
      rr.transfersIn = ReportFilterService.round2(rr.transfersIn);
      rr.transfersOut = ReportFilterService.round2(rr.transfersOut);

      totalOpening += rr.opening;
      totalInflows += rr.inflows;
      totalOutflows += rr.outflows;
      totalTransfersIn += rr.transfersIn;
      totalTransfersOut += rr.transfersOut;
      totalClosing += rr.closing;
      outRows.push(rr);
    }

    return {
      report: 'R2',
      rows: outRows,
      totals: {
        opening: ReportFilterService.round2(totalOpening),
        inflows: ReportFilterService.round2(totalInflows),
        outflows: ReportFilterService.round2(totalOutflows),
        transfersIn: ReportFilterService.round2(totalTransfersIn),
        transfersOut: ReportFilterService.round2(totalTransfersOut),
        closing: ReportFilterService.round2(totalClosing),
        netMovement: ReportFilterService.round2(totalInflows - totalOutflows + totalTransfersIn - totalTransfersOut)
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'All posted (non-voided) cash transactions. Transfers and opening balances are separated, never treated as income or expense.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R15 - Daily cash reconciliation entries.
   * @param {Object} filters { from, to, accountId }
   */
  function runDailyReconciliation(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var records = RepositoryService.readAll(SheetSchemaService.SHEET_DAILY_RECONCILIATIONS);
    var accountFilter = filters.accountId ? String(filters.accountId) : '';

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var date = String(r.reconciliation_date || '');
      if (date < from || date > to) {
        continue;
      }
      if (accountFilter && String(r.account_id) !== accountFilter) {
        continue;
      }
      out.push({
        reconciliationDate: date,
        accountId: r.account_id,
        openingExpected: ReportFilterService.round2(r.opening_expected),
        inflows: ReportFilterService.round2(r.inflows),
        outflows: ReportFilterService.round2(r.outflows),
        transfersIn: ReportFilterService.round2(r.transfers_in),
        transfersOut: ReportFilterService.round2(r.transfers_out),
        expectedClosing: ReportFilterService.round2(r.expected_closing),
        actualClosing: ReportFilterService.round2(r.actual_closing),
        difference: ReportFilterService.round2(r.difference),
        explanation: r.explanation || '',
        status: r.status || '',
        reconciledAt: r.reconciled_at || '',
        reconciledBy: r.reconciled_by || ''
      });
    }

    out.sort(function (a, b) {
      return String(a.reconciliationDate).localeCompare(String(b.reconciliationDate)) ||
        String(a.accountId).localeCompare(String(b.accountId));
    });

    var totalExpected = 0;
    var totalActual = 0;
    var totalDifference = 0;
    for (var j = 0; j < out.length; j++) {
      totalExpected += out[j].expectedClosing;
      totalActual += out[j].actualClosing;
      totalDifference += out[j].difference;
    }

    return {
      report: 'R15',
      rows: out,
      totals: {
        expectedClosing: ReportFilterService.round2(totalExpected),
        actualClosing: ReportFilterService.round2(totalActual),
        difference: ReportFilterService.round2(totalDifference)
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'DailyCashReconciliations records only (one row per account per day).'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R16 Cash conversion summary.
   * Cash in/out for the period (from the ledger), per type.
   * @param {Object} filters { from, to }
   */
  function runCashConversion(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);

    var cashIn = 0;
    var cashOut = 0;
    var capitalIn = 0;
    var capitalOut = 0;
    var refunds = 0;
    var adjustments = 0;
    var byType = {};

    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (!posted(tx) || !inPeriod(tx, from, to)) {
        continue;
      }
      var type = tx.transaction_type;
      var inflow = signedAmount(tx, CashTransactionService.DIRECTION_INFLOW);
      var outflow = signedAmount(tx, CashTransactionService.DIRECTION_OUTFLOW);
      if (isTransfer(type) || isOpening(type)) {
        continue;
      }

      if (!byType[type]) {
        byType[type] = { type: type, in: 0, out: 0 };
      }
      byType[type].in += inflow;
      byType[type].out += outflow;

      if (type === CashTransactionService.TYPE_OWNER_CAPITAL) {
        capitalIn += inflow;
      } else if (type === CashTransactionService.TYPE_OWNER_WITHDRAWAL) {
        capitalOut += outflow;
      } else if (type === CashTransactionService.TYPE_REFUND) {
        refunds += outflow;
      } else if (type === CashTransactionService.TYPE_ADJUSTMENT_IN ||
                 type === CashTransactionService.TYPE_ADJUSTMENT_OUT) {
        adjustments += inflow - outflow;
      } else {
        cashIn += inflow;
        cashOut += outflow;
      }
    }

    var rows = [];
    var types = Object.keys(byType).sort();
    for (var t = 0; t < types.length; t++) {
      var entry = byType[types[t]];
      rows.push({
        type: entry.type,
        cashIn: ReportFilterService.round2(entry.in),
        cashOut: ReportFilterService.round2(entry.out),
        net: ReportFilterService.round2(entry.in - entry.out)
      });
    }

    cashIn = ReportFilterService.round2(cashIn);
    cashOut = ReportFilterService.round2(cashOut);

    return {
      report: 'R16',
      rows: rows,
      summary: {
        cashIn: cashIn,
        cashOut: cashOut,
        capitalIn: ReportFilterService.round2(capitalIn),
        capitalOut: ReportFilterService.round2(capitalOut),
        refunds: ReportFilterService.round2(refunds),
        adjustments: ReportFilterService.round2(adjustments),
        netCashMovement: ReportFilterService.round2(cashIn - cashOut + capitalIn - capitalOut - refunds + adjustments),
        scope: 'Period cash movement from posted ledger transactions. Transfers and opening balances are neutral and excluded.'
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'Posted (non-voided) income, expenses, owner funds, adjustments, and refunds. Transfers excluded.'
      }
    };
  }

  return {
    runCashflow: runCashflow,
    runDailyReconciliation: runDailyReconciliation,
    runCashConversion: runCashConversion
  };
})();