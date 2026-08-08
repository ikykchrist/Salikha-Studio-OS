/**
 * PaymentRepository.gs
 * Sheet access and search for Payments, PaymentAllocations, and
 * Refunds (Sprint 3). No business decisions here.
 */

var PaymentRepository = (function () {
  'use strict';

  // Plain strings: resolved against SheetSchemaService at call time
  // (Apps Script loads files alphabetically).
  var SHEET_PAYMENTS = 'Payments';
  var SHEET_ALLOCATIONS = 'PaymentAllocations';
  var SHEET_REFUNDS = 'Refunds';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    // Runtime guard: constants must match the registered schema.
    SheetSchemaService.getSchema(SHEET_PAYMENTS);
    SheetSchemaService.getSchema(SHEET_ALLOCATIONS);
    SheetSchemaService.getSchema(SHEET_REFUNDS);
  }

  function findPaymentById(paymentId) {
    return RepositoryService.findById(SHEET_PAYMENTS, paymentId);
  }

  function getPayment(paymentId) {
    var record = findPaymentById(paymentId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists payments with filters and pagination.
   */
  function listPayments(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_PAYMENTS);
    var search = ClientRepository.normalizeSearch(filters.search);
    var status = filters.status;
    var method = filters.paymentMethod;
    var accountId = filters.cashAccountId;
    var bookingId = filters.bookingId;
    var clientId = filters.clientId;
    var fromDate = filters.fromDate;
    var toDate = filters.toDate;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (status && String(r.status) !== String(status)) {
        continue;
      }
      if (method && String(r.payment_method) !== String(method)) {
        continue;
      }
      if (accountId && String(r.cash_account_id) !== String(accountId)) {
        continue;
      }
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      if (clientId && String(r.client_id) !== String(clientId)) {
        continue;
      }
      if (fromDate && String(r.payment_date) < String(fromDate)) {
        continue;
      }
      if (toDate && String(r.payment_date) > String(toDate)) {
        continue;
      }
      if (search) {
        var haystack = [r.payment_code, r.payment_date, r.reference_number, r.payer_name, r.client_id].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.paymentDate || '').localeCompare(String(a.paymentDate || ''));
    });
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || 50, 1), 100);
    var total = out.length;
    var start = (page - 1) * pageSize;
    return {
      items: out.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  /* ------------------- Allocations ------------------- */

  function listAllocations(paymentId, bookingId) {
    var records = RepositoryService.readAll(SHEET_ALLOCATIONS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (paymentId && String(r.payment_id) !== String(paymentId)) {
        continue;
      }
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    return out;
  }

  /**
   * Effective paid amount for a booking from valid payment allocations:
   * allocations of POSTED or PARTIALLY_REFUNDED payments count; VOIDED
   * payments never count; fully REFUNDED payments count zero.
   */
  function getEffectivePaid(bookingId) {
    var records = RepositoryService.readAll(SHEET_PAYMENTS);
    var allocations = RepositoryService.findByField(SHEET_ALLOCATIONS, 'booking_id', bookingId);
    var refunds = RepositoryService.findByField(SHEET_REFUNDS, 'booking_id', bookingId);
    var refundedByPayment = {};
    for (var r = 0; r < refunds.length; r++) {
      if (String(refunds[r].status) === 'VOIDED') {
        continue;
      }
      var key = String(refunds[r].payment_id);
      refundedByPayment[key] = (refundedByPayment[key] || 0) + Number(refunds[r].amount || 0);
    }
    var statusByPayment = {};
    for (var p = 0; p < records.length; p++) {
      statusByPayment[String(records[p].payment_id)] = String(records[p].status);
    }
    var paid = 0;
    for (var a = 0; a < allocations.length; a++) {
      var allocation = allocations[a];
      var paymentStatus = statusByPayment[String(allocation.payment_id)] || 'POSTED';
      if (paymentStatus === 'VOIDED' || paymentStatus === 'REFUNDED') {
        continue;
      }
      var amount = Number(allocation.allocated_amount || 0);
      if (paymentStatus === 'PARTIALLY_REFUNDED') {
        amount -= (refundedByPayment[String(allocation.payment_id)] || 0);
      }
      paid += amount;
    }
    return Math.max(paid, 0);
  }

  function getPaymentRefundedTotal(paymentId) {
    var refunds = RepositoryService.findByField(SHEET_REFUNDS, 'payment_id', paymentId);
    var total = 0;
    for (var i = 0; i < refunds.length; i++) {
      if (String(refunds[i].status) !== 'VOIDED') {
        total += Number(refunds[i].amount || 0);
      }
    }
    return total;
  }

  /* ------------------- Refunds ------------------- */

  function findRefundById(refundId) {
    return RepositoryService.findById(SHEET_REFUNDS, refundId);
  }

  function listRefunds(bookingId) {
    var records = RepositoryService.readAll(SHEET_REFUNDS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      if (bookingId && String(records[i].booking_id) !== String(bookingId)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.refundDate || '').localeCompare(String(b.refundDate || ''));
    });
    return out;
  }

  return {
    assertDatabase: assertDatabase,
    findPaymentById: findPaymentById,
    getPayment: getPayment,
    listPayments: listPayments,
    listAllocations: listAllocations,
    getEffectivePaid: getEffectivePaid,
    getPaymentRefundedTotal: getPaymentRefundedTotal,
    findRefundById: findRefundById,
    listRefunds: listRefunds
  };
})();
