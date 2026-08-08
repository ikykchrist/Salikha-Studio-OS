/**
 * BookingRepository.gs
 * Sheet access, search, and pagination for the booking domain
 * (Sprint 3): Bookings, BookingItems, BookingStatusHistory,
 * BookingScheduleHistory. No business decisions here.
 */

var BookingRepository = (function () {
  'use strict';

  // Plain strings: resolved against SheetSchemaService at call time
  // (Apps Script loads files alphabetically, so top-level cross-service
  // references fail for files that load before SheetSchemaService).
  var SHEET_BOOKINGS = 'Bookings';
  var SHEET_ITEMS = 'BookingItems';
  var SHEET_STATUS_HISTORY = 'BookingStatusHistory';
  var SHEET_SCHEDULE_HISTORY = 'BookingScheduleHistory';

  var DEFAULT_PAGE_SIZE = 25;
  var MAX_PAGE_SIZE = 50;

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
    SheetSchemaService.getSchema(SHEET_BOOKINGS);
    SheetSchemaService.getSchema(SHEET_ITEMS);
    SheetSchemaService.getSchema(SHEET_STATUS_HISTORY);
    SheetSchemaService.getSchema(SHEET_SCHEDULE_HISTORY);
  }

  function findById(bookingId) {
    return RepositoryService.findById(SHEET_BOOKINGS, bookingId);
  }

  function getBooking(bookingId) {
    var record = findById(bookingId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists bookings with search, filters, date range, and pagination.
   * Search covers code, title, client, venue, and event name.
   */
  function listBookings(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_BOOKINGS);
    var search = ClientRepository.normalizeSearch(filters.search);
    var status = filters.bookingStatus;
    var paymentStatus = filters.paymentStatus;
    var serviceType = filters.serviceType;
    var fromDate = filters.fromDate;
    var toDate = filters.toDate;
    var excludeCancelled = filters.excludeCancelled === true;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (status && String(r.booking_status) !== String(status)) {
        continue;
      }
      if (paymentStatus && String(r.payment_status) !== String(paymentStatus)) {
        continue;
      }
      if (serviceType && String(r.service_type) !== String(serviceType)) {
        continue;
      }
      if (excludeCancelled && String(r.booking_status) === 'CANCELLED') {
        continue;
      }
      if (fromDate && String(r.event_date) < String(fromDate)) {
        continue;
      }
      if (toDate && String(r.event_date) > String(toDate)) {
        continue;
      }
      if (search) {
        var haystack = [
          r.booking_code, r.booking_title, r.venue_name, r.client_id
        ].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      var dA = String(a.eventDate || '9999-12-31');
      var dB = String(b.eventDate || '9999-12-31');
      return dA.localeCompare(dB);
    });
    return paginate(out, filters);
  }

  function paginate(items, filters) {
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    var total = items.length;
    var start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  /* ------------------- Items ------------------- */

  function listItems(bookingId) {
    var records = RepositoryService.findByField(SHEET_ITEMS, 'booking_id', bookingId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
    });
    return out;
  }

  function itemTotalBySource(bookingId, sourceType) {
    var records = RepositoryService.findByField(SHEET_ITEMS, 'booking_id', bookingId);
    var total = 0;
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].source_type) === String(sourceType)) {
        total += Number(records[i].line_total || 0);
      }
    }
    return total;
  }

  /* ------------------- History ------------------- */

  function appendStatusHistory(entry) {
    RepositoryService.appendRecord(SHEET_STATUS_HISTORY, entry);
  }

  function listStatusHistory(bookingId) {
    var records = RepositoryService.findByField(SHEET_STATUS_HISTORY, 'booking_id', bookingId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.changedAt || '').localeCompare(String(b.changedAt || ''));
    });
    return out;
  }

  function appendScheduleHistory(entry) {
    RepositoryService.appendRecord(SHEET_SCHEDULE_HISTORY, entry);
  }

  function listScheduleHistory(bookingId) {
    var records = RepositoryService.findByField(SHEET_SCHEDULE_HISTORY, 'booking_id', bookingId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.changedAt || '').localeCompare(String(b.changedAt || ''));
    });
    return out;
  }

  return {
    assertDatabase: assertDatabase,
    findById: findById,
    getBooking: getBooking,
    listBookings: listBookings,
    listItems: listItems,
    itemTotalBySource: itemTotalBySource,
    appendStatusHistory: appendStatusHistory,
    listStatusHistory: listStatusHistory,
    appendScheduleHistory: appendScheduleHistory,
    listScheduleHistory: listScheduleHistory,
    DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE: MAX_PAGE_SIZE
  };
})();
