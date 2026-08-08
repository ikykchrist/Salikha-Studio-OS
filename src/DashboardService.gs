/**
 * DashboardService.gs
 * R1 owner dashboard data (Sprint 7).
 *
 * All figures are computed server-side from the ledger and domain
 * records. The frontend only draws; nothing here mutates data.
 *
 * Charts:
 *  - cashTrend30: cumulative cash balance, last 30 days
 *  - revenueVsCosts3m: monthly revenue vs direct costs, last 3 months
 *  - topPackages5: top 5 packages by revenue, last 3 months
 */

var DashboardService = (function () {
  'use strict';

  function todayIso() {
    return ReportFilterService.today();
  }

  /* ------------------------------------------------------------------ */

  function buildMoneyPulse() {
    var accounts = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_ACCOUNTS);
    var totalCash = 0;
    var activeAccounts = 0;
    var perAccount = [];
    for (var a = 0; a < accounts.length; a++) {
      var acc = accounts[a];
      var active = String(acc.is_active) !== 'FALSE' && acc.is_active !== false;
      if (!active) {
        continue;
      }
      var balance = Number(acc.current_balance_cached || 0);
      totalCash += balance;
      activeAccounts++;
      perAccount.push({
        accountId: acc.account_id,
        accountName: acc.account_name,
        accountType: acc.account_type,
        currentBalance: balance
      });
    }

    var today = todayIso();
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    var cashInToday = 0;
    var cashOutToday = 0;
    for (var t = 0; t < transactions.length; t++) {
      var tx = transactions[t];
      if (String(tx.status) === CashTransactionService.STATUS_VOIDED) {
        continue;
      }
      if (String(tx.transaction_date || '') !== today) {
        continue;
      }
      if (String(tx.direction) === CashTransactionService.DIRECTION_INFLOW) {
        cashInToday += Number(tx.amount || 0);
      } else {
        cashOutToday += Number(tx.amount || 0);
      }
    }

    return {
      moneyCash: ReportFilterService.round2(totalCash),
      activeAccounts: activeAccounts,
      cashInToday: ReportFilterService.round2(cashInToday),
      cashOutToday: ReportFilterService.round2(cashOutToday),
      netToday: ReportFilterService.round2(cashInToday - cashOutToday),
      perAccount: perAccount
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * Cumulative ledger balance per day for the last 30 days.
   */
  function buildCashTrend30() {
    var transactions = RepositoryService.readAll(SheetSchemaService.SHEET_CASH_TRANSACTIONS);
    var today = todayIso();
    var start = ReportFilterService.addDays(today, -29);

    var perDay = {};
    var beforeStart = 0;
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (String(tx.status) === CashTransactionService.STATUS_VOIDED) {
        continue;
      }
      var signed = String(tx.direction) === CashTransactionService.DIRECTION_INFLOW
        ? Number(tx.amount || 0)
        : -Number(tx.amount || 0);
      var d = String(tx.transaction_date || '');
      if (d < start) {
        beforeStart += signed;
      } else {
        perDay[d] = (perDay[d] || 0) + signed;
      }
    }

    var out = [];
    var running = ReportFilterService.round2(beforeStart);
    for (var day = -29; day <= 0; day++) {
      var iso = ReportFilterService.addDays(today, day);
      running = ReportFilterService.round2(running + (perDay[iso] || 0));
      out.push({ date: iso, balance: running });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Monthly revenue and direct costs for the current month and two back.
   */
  function buildRevenueVsCosts3m() {
    var today = todayIso();
    var months = [];
    for (var back = 2; back >= 0; back--) {
      var base = new Date(today + 'T00:00:00');
      base.setMonth(base.getMonth() - back);
      months.push({
        key: base.getFullYear() + '-' + ('0' + (base.getMonth() + 1)).slice(-2),
        label: (base.getMonth() + 1) + '/' + base.getFullYear(),
        monthStart: base.getFullYear() + '-' + ('0' + (base.getMonth() + 1)).slice(-2) + '-01'
      });
    }
    var bookingsById = {};
    var bookings = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    for (var b = 0; b < bookings.length; b++) {
      bookingsById[String(bookings[b].booking_id)] = bookings[b];
    }

    var revenueByMonth = {};
    var costByMonth = {};
    var costs = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKING_COSTS);
    for (var c = 0; c < costs.length; c++) {
      var costRow = costs[c];
      var booking = bookingsById[String(costRow.booking_id)];
      if (!booking) {
        continue;
      }
      if (!ReportFilterService.isBookingEligible(booking)) {
        continue;
      }
      var emitMonth = String(booking.event_date || '').substring(0, 7);
      revenueByMonth[emitMonth] = (revenueByMonth[emitMonth] || 0) + Number(costRow.revenue_total || 0);
      costByMonth[emitMonth] = (costByMonth[emitMonth] || 0) + Number(costRow.direct_cost_total || 0);
    }

    var rows = [];
    for (var m = 0; m < months.length; m++) {
      var rev = revenueByMonth[months[m].key] || 0;
      var cost = costByMonth[months[m].key] || 0;
      rows.push({
        label: months[m].label,
        revenue: ReportFilterService.round2(rev),
        directCosts: ReportFilterService.round2(cost),
        grossProfit: ReportFilterService.round2(rev - cost)
      });
    }
    return rows;
  }

  /* ------------------------------------------------------------------ */

  function buildTopPackages5() {
    var today = todayIso();
    var from = ReportFilterService.addDays(today, -90);
    var result = SalesReportService.runRevenueByPackage({ fromDate: from, toDate: today });
    var rows = (result.rows || []).slice(0, 5);
    var total = result.summary && result.summary.totalRevenue ? result.summary.totalRevenue : 0;
    for (var i = 0; i < rows.length; i++) {
      rows[i].sharePct = total > 0 ? ReportFilterService.round2((rows[i].revenue / total) * 100) : 0;
    }
    return rows;
  }

  /* ------------------------------------------------------------------ */

  function countUnreconciledDeployments() {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_EVENT_DEPLOYMENTS);
    var count = 0;
    for (var i = 0; i < records.length; i++) {
      var status = String(records[i].status || '');
      if (status !== 'RECONCILED' && status !== 'CLOSED') {
        count++;
      }
    }
    return count;
  }

  /**
   * R1 dashboard payload.
   */
  function getDashboardData() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }

    var money = buildMoneyPulse();
    var summary = BookingService.getBookingSummary();
    var overdue = ReceivableService.listReceivables({ mode: 'overdue' });
    var lowStock = InventoryReportService.runLowStock({});

    return {
      generatedAt: DateService.nowIso(),
      money: money,
      booking: {
        upcomingEvents: summary.upcomingEvents,
        confirmedBookings: summary.confirmedBookings,
        outstandingReceivables: summary.outstandingReceivables,
        paymentsThisMonth: summary.paymentsThisMonth,
        unpaidConfirmed: summary.unpaidConfirmed,
        overpayments: summary.overpayments,
        missingEventDetails: summary.missingEventDetails,
        refundReviews: summary.refundReviews
      },
      alerts: {
        overdueReceivables: overdue.total,
        lowStockItems: lowStock.rows.length,
        unreconciledDeployments: countUnreconciledDeployments()
      },
      charts: {
        cashTrend30: buildCashTrend30(),
        revenueVsCosts3m: buildRevenueVsCosts3m(),
        topPackages5: buildTopPackages5()
      }
    };
  }

  return {
    getDashboardData: getDashboardData,
    buildMoneyPulse: buildMoneyPulse,
    buildCashTrend30: buildCashTrend30,
    buildRevenueVsCosts3m: buildRevenueVsCosts3m,
    buildTopPackages5: buildTopPackages5
  };
})();