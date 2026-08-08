/**
 * ProfitReportService.gs
 * Accrual profitability reports (Sprint 7).
 *
 * R3  Income Statement (accrual view)
 * R7  Booking Profitability
 *
 * Revenue comes from the BookingCosts snapshots (revenue_total, direct
 * cost buckets, gross/net/margin) - never recomputed in the frontend.
 * Operating expenses come from approved & paid expenses of cost type
 * OPERATING. Cash recognized is reported separately (R16); this report
 * is the accrual view.
 */

var ProfitReportService = (function () {
  'use strict';

  function inRange(isoDate, from, to) {
    return ReportFilterService.inRange(isoDate, from, to);
  }
  function inPeriod(dateIso, from, to) {
    var d = String(dateIso || '');
    return d >= from && d <= to;
  }

  function isEligibleBooking(booking) {
    return ReportFilterService.isBookingEligible(booking);
  }

  function isPaidExpense(exp) {
    if (String(exp.approval_status || '') !== 'PAID') {
      return false;
    }
    return !String(exp.voided_at || '');
  }

  /* ------------------------------------------------------------------ */

  /**
   * R3 - Income statement for a period.
   * @param {Object} filters { fromDate, toDate }
   */
  function runIncomeStatement(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var bookingsWithCosts = loadBookingsWithCosts();
    var expenses = RepositoryService.readAll(SheetSchemaService.SHEET_EXPENSES);

    var revenue = 0;
    var directCost = 0;
    var count = 0;

    for (var i = 0; i < bookingsWithCosts.length; i++) {
      var item = bookingsWithCosts[i];
      var booking = item.booking;
      if (!booking || !inRange(booking.event_date, from, to)) {
        continue;
      }
      if (!isEligibleBooking(booking)) {
        continue;
      }
      var rev = Number(item.costs.revenue_total || 0);
      var cost = Number(item.costs.direct_cost_total || 0);
      revenue += rev;
      directCost += cost;
      count++;
    }

    var operatingExpenses = 0;
    var operatingExpenseCount = 0;
    var byCategory = {};
    for (var x = 0; x < expenses.length; x++) {
      var exp = expenses[x];
      if (!isPaidExpense(exp)) {
        continue;
      }
      if (String(exp.cost_type || '') !== 'OPERATING') {
        continue;
      }
      var paidDate = ReportFilterService.datePart(exp.paid_at || exp.expense_date);
      if (!inRange(paidDate, from, to)) {
        continue;
      }
      var categoryId = exp.category_id || 'UNCATEGORIZED';
      byCategory[categoryId] = byCategory[categoryId] || 0;
      byCategory[categoryId] += Number(exp.net_amount || exp.gross_amount || 0);
      operatingExpenses += Number(exp.net_amount || exp.gross_amount || 0);
      operatingExpenseCount++;
    }
    operatingExpenses = ReportFilterService.round2(operatingExpenses);

    var grossProfit = ReportFilterService.round2(revenue - directCost);
    var netProfit = ReportFilterService.round2(grossProfit - operatingExpenses);

    return {
      report: 'R3',
      summary: {
        revenue: ReportFilterService.round2(revenue),
        directCost: ReportFilterService.round2(directCost),
        grossProfit: grossProfit,
        operatingExpenses: operatingExpenses,
        netProfit: netProfit,
        grossMarginPct: revenue > 0 ? ReportFilterService.round2((grossProfit / revenue) * 100) : 0,
        netMarginPct: revenue > 0 ? ReportFilterService.round2((netProfit / revenue) * 100) : 0,
        bookingCount: count,
        operatingExpenseCount: operatingExpenseCount
      },
      expenseBreakdown: {
        byCategory: byCategory,
        categories: categoriesById()
      },
      scope: {
        dateRange: from + ' to ' + to,
        revenue: 'BookingCosts.revenueTotal for bookings with event date in period whose status is CONFIRMED/PREPARING/READY/IN_PROGRESS/COMPLETED/ARCHIVED.',
        directCosts: 'BookingCosts.directCostTotal (same set of bookings).',
        operatingExpenses: 'Expenses with cost type OPERATING in approval status PAID, dated by paid_at within the period.',
        note: 'Accrual view. Cash movement is reported separately (Cashflow Report). Depreciation and inventory valuation are informational only.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R7 - Booking profitability list.
   * @param {Object} filters { fromDate, toDate }
   */
  function runBookingProfitability(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var items = loadBookingsWithCosts();
    var clients = {};

    var clientRecords = RepositoryService.readAll(SheetSchemaService.SHEET_CLIENTS);
    for (var c = 0; c < clientRecords.length; c++) {
      clients[String(clientRecords[c].client_id)] = clientRecords[c].full_name ||
        clientRecords[c].first_name + ' ' + clientRecords[c].last_name ||
        clientRecords[c].business_or_organization || '';
    }

    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var booking = item.booking;
      if (!booking || !inRange(booking.event_date, from, to)) {
        continue;
      }
      if (!isEligibleBooking(booking)) {
        continue;
      }
      rows.push({
        bookingId: booking.booking_id,
        bookingCode: booking.booking_code,
        bookingTitle: booking.booking_title,
        clientName: clients[String(booking.client_id)] || '',
        eventDate: booking.event_date || '',
        status: booking.booking_status,
        revenue: ReportFilterService.round2(Number(item.costs.revenue_total || 0)),
        material: ReportFilterService.round2(Number(item.costs.cost_material || 0)),
        transport: ReportFilterService.round2(Number(item.costs.cost_transport || 0)),
        meals: ReportFilterService.round2(Number(item.costs.cost_meals || 0)),
        crew: ReportFilterService.round2(Number(item.costs.cost_crew || 0)),
        commission: ReportFilterService.round2(Number(item.costs.cost_commission || 0)),
        otherDirect: ReportFilterService.round2(Number(item.costs.cost_other_direct || 0)),
        directCost: ReportFilterService.round2(Number(item.costs.direct_cost_total || 0)),
        grossProfit: ReportFilterService.round2(Number(item.costs.gross_profit || 0)),
        allocOpsCost: ReportFilterService.round2(Number(item.costs.alloc_ops_cost || 0)),
        netProfit: ReportFilterService.round2(Number(item.costs.net_profit || 0)),
        profitMarginPct: ReportFilterService.round2(Number(item.costs.profit_margin_pct || 0))
      });
    }

    rows.sort(function (a, b) {
      return String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
    });

    var totals = { revenue: 0, material: 0, transport: 0, meals: 0, crew: 0, commission: 0, otherDirect: 0, directCost: 0, grossProfit: 0, allocOpsCost: 0, netProfit: 0 };
    for (var r = 0; r < rows.length; r++) {
      totals.revenue += rows[r].revenue;
      totals.material += rows[r].material;
      totals.transport += rows[r].transport;
      totals.meals += rows[r].meals;
      totals.crew += rows[r].crew;
      totals.commission += rows[r].commission;
      totals.otherDirect += rows[r].otherDirect;
      totals.directCost += rows[r].directCost;
      totals.grossProfit += rows[r].grossProfit;
      totals.allocOpsCost += rows[r].allocOpsCost;
      totals.netProfit += rows[r].netProfit;
    }

    return {
      report: 'R7',
      rows: rows,
      totals: {
        revenue: ReportFilterService.round2(totals.revenue),
        material: ReportFilterService.round2(totals.material),
        transport: ReportFilterService.round2(totals.transport),
        meals: ReportFilterService.round2(totals.meals),
        crew: ReportFilterService.round2(totals.crew),
        commission: ReportFilterService.round2(totals.commission),
        otherDirect: ReportFilterService.round2(totals.otherDirect),
        directCost: ReportFilterService.round2(totals.directCost),
        grossProfit: ReportFilterService.round2(totals.grossProfit),
        allocOpsCost: ReportFilterService.round2(totals.allocOpsCost),
        netProfit: ReportFilterService.round2(totals.netProfit)
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'BookingCosts snapshots for bookings with event date in the range whose status is CONFIRMED/PREPARING/READY/IN_PROGRESS/COMPLETED/ARCHIVED. Direct cost buckets (material/transport/meals/crew/commission/other) sum to directCost.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R8 - Expense breakdown by category.
   * @param {Object} filters { fromDate, toDate }
   */
  function runExpenseBreakdown(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var expenses = RepositoryService.readAll(SheetSchemaService.SHEET_EXPENSES);
    var categories = {};
    var categoryRecords = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    for (var c = 0; c < categoryRecords.length; c++) {
      categories[String(categoryRecords[c].category_id)] = categoryRecords[c].category_name || '';
    }

    var rows = [];
    var totals = { count: 0, grossAmount: 0, taxAmount: 0, netAmount: 0 };
    var mapping = {};

    for (var x = 0; x < expenses.length; x++) {
      var exp = expenses[x];
      if (!isPaidExpense(exp)) {
        continue;
      }
      var paidDate = ReportFilterService.datePart(exp.paid_at || exp.expense_date);
      if (!inRange(paidDate, from, to)) {
        continue;
      }
      var categoryId = String(exp.category_id || 'UNCATEGORIZED');
      if (!mapping[categoryId]) {
        mapping[categoryId] = {
          categoryId: categoryId,
          categoryName: categories[categoryId] || 'Uncategorized',
          count: 0,
          grossAmount: 0,
          taxAmount: 0,
          netAmount: 0
        };
        rows.push(mapping[categoryId]);
      }
      var gross = Number(exp.gross_amount || 0);
      var tax = Number(exp.tax_amount || 0);
      var net = Number(exp.net_amount || gross - tax);
      mapping[categoryId].count++;
      mapping[categoryId].grossAmount += gross;
      mapping[categoryId].taxAmount += tax;
      mapping[categoryId].netAmount += net;
      totals.count++;
      totals.grossAmount += gross;
      totals.taxAmount += tax;
      totals.netAmount += net;
    }

    for (var r = 0; r < rows.length; r++) {
      rows[r].grossAmount = ReportFilterService.round2(rows[r].grossAmount);
      rows[r].taxAmount = ReportFilterService.round2(rows[r].taxAmount);
      rows[r].netAmount = ReportFilterService.round2(rows[r].netAmount);
      rows[r].sharePct = totals.netAmount > 0 ? ReportFilterService.round2((rows[r].netAmount / totals.netAmount) * 100) : 0;
    }
    rows.sort(function (a, b) {
      return b.grossAmount - a.grossAmount;
    });

    return {
      report: 'R8',
      rows: rows,
      totals: {
        count: totals.count,
        grossAmount: ReportFilterService.round2(totals.grossAmount),
        taxAmount: ReportFilterService.round2(totals.taxAmount),
        netAmount: ReportFilterService.round2(totals.netAmount)
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'Paid (approved + PAID) expenses dated by paid_at within the range, grouped by financial category. Net = gross - tax. sharePct = category net / total net.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  function loadBookings() {
    return RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
  }

  function loadBookingsWithCosts() {
    var bookings = loadBookings();
    var costs = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKING_COSTS);
    var byBooking = {};
    for (var i = 0; i < costs.length; i++) {
      byBooking[String(costs[i].booking_id)] = costs[i];
    }
    var out = [];
    for (var b = 0; b < bookings.length; b++) {
      var cost = byBooking[String(bookings[b].booking_id)];
      if (cost) {
        out.push({ booking: bookings[b], costs: cost });
      }
    }
    return out;
  }

  function categoriesById() {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    var map = {};
    for (var i = 0; i < records.length; i++) {
      map[String(records[i].category_id)] = records[i].category_name || '';
    }
    return map;
  }

  return {
    runIncomeStatement: runIncomeStatement,
    runBookingProfitability: runBookingProfitability,
    runExpenseBreakdown: runExpenseBreakdown
  };
})();