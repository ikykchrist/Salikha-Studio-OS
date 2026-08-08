/**
 * ReportFilterService.gs
 * Shared date/range/filter helpers for the report suite (Sprint 7).
 *
 * All reports accept ISO date filters (yyyy-mm-dd, inclusive on both
 * ends). Nothing here touches the sheet layer; this module only
 * normalizes and validates user-provided filter values.
 */

var ReportFilterService = (function () {
  'use strict';

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /**
   * Statuses that count as recognized (accrued) revenue for the report
   * suite (REPORT_DEFINITIONS.md R3-R8). INQUIRY/TENTATIVE bookings are
   * not yet confirmed revenue; CANCELLED is not revenue; DRAFT is not
   * booked.
   */
  var BOOKING_STATUS_ELIGIBLE = ['CONFIRMED', 'PREPARING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'];

  /**
   * True when the booking belongs in revenue/aging reports. The single
   * source of truth for booking eligibility across the report suite.
   */
  function isBookingEligible(booking) {
    var status = String(booking && booking.booking_status || '');
    return BOOKING_STATUS_ELIGIBLE.indexOf(status) !== -1;
  }

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  /**
   * True when the value looks like an ISO date.
   */
  function isIsoDate(value) {
    return typeof value === 'string' && DATE_RE.test(value);
  }

  /**
   * Normalizes a filter value into a plain ISO date string
   * (yyyy-MM-dd). Accepts '', null, 'YYYY-MM-DD', or a Date.
   * Returns '' when unparseable.
   */
  function toIsoDate(value) {
    if (!value) {
      return '';
    }
    if (isIsoDate(String(value))) {
      return String(value);
    }
    var d = new Date(value);
    if (isNaN(d.getTime())) {
      return '';
    }
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  /**
   * ISO string for today in the business timezone.
   */
  function today() {
    return toIsoDate(DateService.now());
  }

  /**
   * Adds n days to an ISO date and returns an ISO date.
   */
  function addDays(isoDate, days) {
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) {
      return '';
    }
    d.setDate(d.getDate() + Number(days || 0));
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  /**
   * First and last day (ISO) of the month containing the given ISO date.
   */
  function monthBounds(isoDate) {
    var y = Number(String(isoDate).substring(0, 4));
    var m = Number(String(isoDate).substring(5, 7));
    if (!y || !m || m < 1 || m > 12) {
      y = 2000;
      m = 1;
    }
    var first = y + '-' + ('0' + m).slice(-2) + '-01';
    var lastDay = new Date(y, m, 0).getDate();
    return { first: first, last: y + '-' + ('0' + m).slice(-2) + '-' + ('0' + lastDay).slice(-2) };
  }

  /**
   * Default report range: the current month.
   */
  function defaultRange() {
    var t = today();
    var first = t.substring(0, 8) + '01';
    return { from: first, to: t };
  }

  /**
   * Normalizes { fromDate, toDate } with defaults and validation.
   * Throws VALIDATION_ERROR when the range is inverted.
   */
  function normalizeDateRange(filters, defaults) {
    defaults = defaults || {};
    var d = defaultRange();
    var from = toIsoDate(filters.fromDate || defaults.fromDate);
    var to = toIsoDate(filters.toDate || defaults.toDate);
    if (!from) {
      from = d.from;
    }
    if (!to) {
      to = d.to;
    }
    if (from > to) {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'Invalid report range: fromDate must not be after toDate.',
        { fromDate: from, toDate: to },
        ErrorService.CATEGORY_VALIDATION
      );
    }
    return { from: from, to: to };
  }

  function inRange(isoDate, from, to) {
    return String(isoDate || '') >= String(from) && String(isoDate || '') <= String(to);
  }

  function numberOf(value, fallback) {
    var n = Number(value);
    return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
  }

  function stringOf(value, fallback) {
    var s = String(value || '');
    return s ? s : fallback;
  }

  /**
   * Strip to the leading 10 characters (yyyy-MM-dd) when the value is a
   * full datetime stamp.
   */
  function datePart(value) {
    return String(value || '').substring(0, 10);
  }

  /**
   * Selected text columns for a detail row.
   */
  function pick(record, keys) {
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = record[keys[i]];
    }
    return out;
  }

  return {
    round2: round2,
    isIsoDate: isIsoDate,
    toIsoDate: toIsoDate,
    today: today,
    addDays: addDays,
    monthBounds: monthBounds,
    defaultRange: defaultRange,
    normalizeDateRange: normalizeDateRange,
    inRange: inRange,
    numberOf: numberOf,
    stringOf: stringOf,
    datePart: datePart,
    pick: pick,
    isBookingEligible: isBookingEligible,
    BOOKING_STATUS_ELIGIBLE: BOOKING_STATUS_ELIGIBLE
  };
})();