/**
 * SalesReportService.gs
 * Receivables and revenue analysis (Sprint 7).
 *
 * R4  Receivables (Outstanding Balances + aging)
 * R5  Revenue by Service
 * R6  Revenue by Package
 *
 * Receivables are computed from bookings only: balance = gross booking
 * amount - effective paid (valid allocations of non-voided, non-refunded
 * payments). Revenue attribution uses the booking's event date.
 */

var SalesReportService = (function () {
  'use strict';

  function inPeriod(dateIso, from, to) {
    var d = String(dateIso || '');
    return d >= from && d <= to;
  }

  function eligible(booking) {
    return ReportFilterService.isBookingEligible(booking);
  }

  /* ------------------------------------------------------------------ */

  /**
   * R4 - Receivables with aging buckets.
   * @param {Object} filters { fromDate, toDate } - balance as of "to".
   */
  function runReceivables(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var to = range.to;

    var bookings = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var clients = {};
    var clientRecords = RepositoryService.readAll(SheetSchemaService.SHEET_CLIENTS);
    for (var c = 0; c < clientRecords.length; c++) {
      clients[String(clientRecords[c].client_id)] = clientRecords[c].full_name ||
        (clientRecords[c].first_name + ' ' + clientRecords[c].last_name) ||
        clientRecords[c].business_or_organization || '';
    }

    var rows = [];
    for (var i = 0; i < bookings.length; i++) {
      var b = bookings[i];
      if (!eligible(b)) {
        continue;
      }
      var gross = Number(b.gross_booking_amount || 0);
      var paid = ReceivableService.getBookingPaid(b.booking_id);
      var balance = ReportFilterService.round2(gross - paid);
      if (balance <= 0.005) {
        continue;
      }
      var eventDate = String(b.event_date || '');
      var days;
      var bucket;
      if (!eventDate || eventDate >= to) {
        bucket = 'CURRENT';
      } else {
        days = daysBetween(eventDate, to);
        if (days <= 30) {
          bucket = '1-30';
        } else if (days <= 60) {
          bucket = '31-60';
        } else if (days <= 90) {
          bucket = '61-90';
        } else {
          bucket = '90+';
        }
      }
      rows.push({
        bookingId: b.booking_id,
        bookingCode: b.booking_code,
        bookingTitle: b.booking_title,
        clientName: clients[String(b.client_id)] || '',
        eventDate: eventDate,
        daysPastDue: days === undefined ? null : days,
        gross: ReportFilterService.round2(gross),
        paid: ReportFilterService.round2(paid),
        balance: balance,
        bucket: bucket,
        status: b.booking_status
      });
    }

    rows.sort(function (a, b) {
      return String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
    });

    var totals = { gross: 0, paid: 0, balance: 0 };
    var bucketTotals = {};
    for (var r = 0; r < rows.length; r++) {
      totals.gross += rows[r].gross;
      totals.paid += rows[r].paid;
      totals.balance += rows[r].balance;
      bucketTotals[rows[r].bucket] = bucketTotals[rows[r].bucket] || 0;
      bucketTotals[rows[r].bucket] += rows[r].balance;
    }

    return {
      report: 'R4',
      rows: rows,
      summary: {
        totalOutstanding: ReportFilterService.round2(totals.balance),
        bookingCount: rows.length
      },
      totals: {
        gross: ReportFilterService.round2(totals.gross),
        paid: ReportFilterService.round2(totals.paid),
        balance: ReportFilterService.round2(totals.balance)
      },
      bucketTotals: bucketTotals,
      scope: {
        dateRange: 'As of ' + to,
        transactionTypes: 'Bookings whose status is confirmed or later (CONFIRMED/PREPARING/READY/IN_PROGRESS/COMPLETED/ARCHIVED). Balance = gross - effective paid. Aging basis: event date vs report end date.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R5 - Revenue by service (from booking line items).
   */
  function runRevenueByService(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var items = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKING_ITEMS);
    var bookingsById = {};
    var bookingRecords = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    for (var i = 0; i < bookingRecords.length; i++) {
      bookingsById[String(bookingRecords[i].booking_id)] = bookingRecords[i];
    }

    var groups = {};
    for (var x = 0; x < items.length; x++) {
      var item = items[x];
      var booking = bookingsById[String(item.booking_id)];
      if (!booking || !eligible(booking) || !inPeriod(booking.event_date, from, to)) {
        continue;
      }
      var key = String(item.source_type || 'OTHER') + '|' + String(item.item_name || 'Unknown');
      if (!groups[key]) {
        groups[key] = { sourceType: item.source_type || '', serviceName: item.item_name || 'Unknown', quantity: 0, revenue: 0, bookings: 0, bookingIds: {} };
      }
      groups[key].quantity += Number(item.quantity || 0);
      groups[key].revenue += Number(item.line_total || 0);
      if (!groups[key].bookingIds[item.booking_id]) {
        groups[key].bookingIds[item.booking_id] = true;
        groups[key].bookings++;
      }
    }

    var rows = [];
    for (var key in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, key)) {
        rows.push(groups[key]);
      }
    }
    rows.sort(function (a, b) {
      return b.revenue - a.revenue;
    });

    var totalRevenue = 0;
    for (var r = 0; r < rows.length; r++) {
      totalRevenue += rows[r].revenue;
    }
    for (var q = 0; q < rows.length; q++) {
      rows[q].revenue = ReportFilterService.round2(rows[q].revenue);
      rows[q].sharePct = totalRevenue > 0 ? ReportFilterService.round2((rows[q].revenue / totalRevenue) * 100) : 0;
      delete rows[q].bookingIds;
    }

    return {
      report: 'R5',
      rows: rows,
      summary: {
        totalRevenue: ReportFilterService.round2(totalRevenue),
        serviceCount: rows.length
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'BookingItems revenue for bookings with event date in range whose status is confirmed or later (CONFIRMED/PREPARING/READY/IN_PROGRESS/COMPLETED/ARCHIVED).'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R6 - Revenue by package.
   * @param {Object} filters { fromDate, toDate }
   */
  function runRevenueByPackage(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var bookings = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var costRecords = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKING_COSTS);
    var costByBooking = {};
    for (var c = 0; c < costRecords.length; c++) {
      costByBooking[String(costRecords[c].booking_id)] = costRecords[c];
    }
    var groups = {};
    for (var i = 0; i < bookings.length; i++) {
      var booking = bookings[i];
      if (!eligible(booking) || !inPeriod(booking.event_date, from, to)) {
        continue;
      }
      var name = String(booking.package_name_snapshot || booking.package_id || 'Unknown');
      if (!groups[name]) {
        groups[name] = { packageName: name, bookings: 0, revenue: 0, avgPrice: 0 };
      }
      var costs = costByBooking[String(booking.booking_id)];
      var revenue = costs && Number(costs.revenue_total || 0)
        ? Number(costs.revenue_total || 0)
        : Number(booking.gross_booking_amount || 0);
      groups[name].bookings++;
      groups[name].revenue += revenue;
    }

    var rows = [];
    for (var key in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, key)) {
        rows.push(groups[key]);
      }
    }
    rows.sort(function (a, b) {
      return b.revenue - a.revenue;
    });

    var totalRevenue = 0;
    for (var r = 0; r < rows.length; r++) {
      totalRevenue += rows[r].revenue;
    }
    for (var q = 0; q < rows.length; q++) {
      rows[q].revenue = ReportFilterService.round2(rows[q].revenue);
      rows[q].avgPrice = ReportFilterService.round2(rows[q].revenue / Math.max(rows[q].bookings, 1));
      rows[q].sharePct = totalRevenue > 0 ? ReportFilterService.round2((rows[q].revenue / totalRevenue) * 100) : 0;
    }

    return {
      report: 'R6',
      rows: rows,
      summary: {
        totalRevenue: ReportFilterService.round2(totalRevenue),
        packageCount: rows.length
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'Bookings with event date in range whose status is confirmed or later (CONFIRMED/PREPARING/READY/IN_PROGRESS/COMPLETED/ARCHIVED). Revenue is the BookingCosts.revenueTotal snapshot (gross booking amount as fallback); avgPrice = revenue / bookings.'
      }
    };
  }

  function daysBetween(fromDate, toDate) {
    var ms = new Date(toDate + 'T00:00:00') - new Date(fromDate + 'T00:00:00');
    return Math.round(ms / (24 * 3600 * 1000));
  }

  return {
    runReceivables: runReceivables,
    runRevenueByService: runRevenueByService,
    runRevenueByPackage: runRevenueByPackage
  };
})();