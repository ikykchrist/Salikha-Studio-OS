/**
 * ReceivableService.gs
 * Accounts receivable (Sprint 3).
 *
 * Booking receivable = gross booking amount - effective paid amount.
 * Effective paid comes only from valid allocations of non-voided,
 * non-refunded payments. Cached booking balances must always match this.
 */

var ReceivableService = (function () {
  'use strict';

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function getBookingPaid(bookingId) {
    return round2(PaymentRepository.getEffectivePaid(bookingId));
  }

  function getBookingReceivable(bookingId) {
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var gross = Number(booking.gross_booking_amount || 0);
    return round2(gross - getBookingPaid(bookingId));
  }

  function getClientReceivableSummary(clientId) {
    var records = RepositoryService.findByField(SheetSchemaService.SHEET_BOOKINGS, 'client_id', clientId);
    var totalOutstanding = 0;
    var bookingCount = 0;
    var paidTotal = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.booking_status) === 'ARCHIVED') {
        continue;
      }
      bookingCount++;
      var gross = Number(r.gross_booking_amount || 0);
      var paid = getBookingPaid(r.booking_id);
      paidTotal += paid;
      totalOutstanding += round2(gross - paid);
    }
    return {
      clientId: clientId,
      bookingsCount: bookingCount,
      totalPaid: round2(paidTotal),
      outstandingBalance: round2(totalOutstanding)
    };
  }

  function getBookingReceivableSummary(bookingId) {
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return {
      bookingId: bookingId,
      grossBookingAmount: Number(booking.gross_booking_amount || 0),
      paid: getBookingPaid(bookingId),
      balanceDue: getBookingReceivable(bookingId),
      paymentStatus: computePaymentStatus(Number(booking.gross_booking_amount || 0), getBookingPaid(bookingId), bookingId)
    };
  }

  /**
   * Server-computed payment status.
   */
  function computePaymentStatus(gross, paid, bookingId) {
    var hasValidRefund = false;
    if (bookingId) {
      var refunds = RepositoryService.findByField(SheetSchemaService.SHEET_REFUNDS, 'booking_id', bookingId);
      for (var i = 0; i < refunds.length; i++) {
        if (String(refunds[i].status) !== 'VOIDED') {
          hasValidRefund = true;
          break;
        }
      }
    }
    if (paid <= 0.005) {
      return hasValidRefund ? 'REFUNDED' : 'UNPAID';
    }
    if (gross - paid > 0.005) {
      return hasValidRefund ? 'PARTIALLY_PAID' : 'PARTIALLY_PAID';
    }
    if (paid - gross > 0.005) {
      return 'OVERPAID';
    }
    return 'PAID';
  }

  /**
   * Total outstanding across all non-archived bookings.
   */
  function getOutstandingTotal() {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var total = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.booking_status) === 'ARCHIVED') {
        continue;
      }
      total += round2(Number(r.gross_booking_amount || 0) - getBookingPaid(r.booking_id));
    }
    return round2(total);
  }

  /**
   * Receivables list for the interface.
   */
  function listReceivables(filters) {
    filters = filters || {};
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var mode = filters.mode || 'outstanding';
    var today = DateService.toIsoDate(DateService.now());
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.booking_status) === 'ARCHIVED') {
        continue;
      }
      var gross = Number(r.gross_booking_amount || 0);
      var paid = getBookingPaid(r.booking_id);
      var balance = round2(gross - paid);
      var status = computePaymentStatus(gross, paid, r.booking_id);
      var pastEvent = String(r.event_date || '') < today;
      var apply = true;
      switch (mode) {
        case 'outstanding':
          apply = balance > 0.005;
          break;
        case 'overdue':
          apply = balance > 0.005 && pastEvent;
          break;
        case 'upcoming':
          apply = balance > 0.005 && !pastEvent;
          break;
        case 'partially_paid':
          apply = status === 'PARTIALLY_PAID';
          break;
        case 'unpaid':
          apply = status === 'UNPAID';
          break;
        case 'overpaid':
          apply = status === 'OVERPAID';
          break;
        default:
          break;
      }
      if (!apply) {
        continue;
      }
      out.push({
        bookingId: r.booking_id,
        bookingCode: r.booking_code,
        bookingTitle: r.booking_title,
        clientId: r.client_id,
        eventDate: r.event_date || '',
        venueName: r.venue_name || '',
        grossBookingAmount: gross,
        paid: paid,
        balanceDue: balance,
        paymentStatus: status,
        daysUntilEvent: pastEvent ? null : daysBetween(today, r.event_date || '')
      });
    }
    out.sort(function (a, b) {
      return String(a.eventDate || '9999-12-31').localeCompare(String(b.eventDate || '9999-12-31'));
    });
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 50);
    var total = out.length;
    var start = (page - 1) * pageSize;
    return { items: out.slice(start, start + pageSize), total: total, page: page, pageSize: pageSize };
  }

  function daysBetween(fromDate, toDate) {
    var ms = new Date(toDate + 'T00:00:00') - new Date(fromDate + 'T00:00:00');
    return Math.round(ms / (24 * 3600 * 1000));
  }

  /**
   * Refreshes client cached totals after payment/void/refund events.
   */
  function refreshClientCachedTotals() {
    var clients = RepositoryService.readAll(SheetSchemaService.SHEET_CLIENTS);
    var bookings = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var byClient = {};
    for (var c = 0; c < clients.length; c++) {
      byClient[String(clients[c].client_id)] = {
        totalBookings: 0,
        totalRevenue: 0,
        outstanding: 0
      };
    }
    for (var b = 0; b < bookings.length; b++) {
      var r = bookings[b];
      var bucket = byClient[String(r.client_id)];
      if (!bucket || String(r.booking_status) === 'ARCHIVED') {
        continue;
      }
      bucket.totalBookings++;
      bucket.totalRevenue += Number(r.gross_booking_amount || 0);
      bucket.outstanding += round2(Number(r.gross_booking_amount || 0) - getBookingPaid(r.booking_id));
    }
    var updates = [];
    var now = DateService.nowIso();
    var actor = AuditService.getActor();
    for (var key in byClient) {
      if (!Object.prototype.hasOwnProperty.call(byClient, key)) {
        continue;
      }
      var data = byClient[key];
      updates.push({
        id: key,
        patch: {
          total_bookings_cached: data.totalBookings,
          total_revenue_cached: round2(data.totalRevenue),
          outstanding_balance_cached: round2(data.outstanding),
          updated_at: now,
          updated_by: actor.userId
        }
      });
    }
    RepositoryService.batchUpdateById(SheetSchemaService.SHEET_CLIENTS, updates);
  }

  /**
   * Refreshes a booking's cached paid/balance/payment-status fields.
   */
  function refreshBookingCaches(bookingId) {
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      return;
    }
    var gross = Number(booking.gross_booking_amount || 0);
    var paid = getBookingPaid(bookingId);
    var balance = round2(gross - paid);
    var status = computePaymentStatus(gross, paid, bookingId);
    var actor = AuditService.getActor();
    RepositoryService.updateById(SheetSchemaService.SHEET_BOOKINGS, bookingId, {
      amount_paid_cached: paid,
      balance_due_cached: balance,
      payment_status: status,
      updated_at: DateService.nowIso(),
      updated_by: actor.userId
    });
    return { paid: paid, balanceDue: balance, paymentStatus: status };
  }

  return {
    getBookingPaid: getBookingPaid,
    getBookingReceivable: getBookingReceivable,
    getClientReceivableSummary: getClientReceivableSummary,
    getBookingReceivableSummary: getBookingReceivableSummary,
    computePaymentStatus: computePaymentStatus,
    getOutstandingTotal: getOutstandingTotal,
    listReceivables: listReceivables,
    refreshClientCachedTotals: refreshClientCachedTotals,
    refreshBookingCaches: refreshBookingCaches
  };
})();
