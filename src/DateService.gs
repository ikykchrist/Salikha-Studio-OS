/**
 * DateService.gs
 * Date and time helpers for Salikha Studio OS.
 *
 * The business timezone (Asia/Manila) is the single source of time
 * truth. Ambiguous string parsing is avoided: inputs are normalized
 * explicitly or rejected.
 */

var DateService = (function () {
  'use strict';

  var DISPLAY_DATE_FORMAT = 'MMM dd, yyyy';
  var DISPLAY_DATETIME_FORMAT = 'MMM dd, yyyy HH:mm';
  var ISO_DATE_FORMAT = 'yyyy-MM-dd';
  var ISO_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX";

  function timezone() {
    return Config.getBusinessTimezone_();
  }

  /**
   * Current business-timezone Date object.
   */
  function now() {
    return new Date();
  }

  /**
   * Current timestamp formatted in business timezone (ISO-8601-ish).
   */
  function nowIso() {
    return Utilities.formatDate(new Date(), timezone(), ISO_DATETIME_FORMAT);
  }

  function toIsoDate(value) {
    var date = normalizeInputDate(value);
    if (!date) {
      return null;
    }
    return Utilities.formatDate(date, timezone(), ISO_DATE_FORMAT);
  }

  function toIsoDateTime(value) {
    var date = normalizeInputDate(value);
    if (!date) {
      return null;
    }
    return Utilities.formatDate(date, timezone(), ISO_DATETIME_FORMAT);
  }

  /**
   * Display format: "Aug 07, 2026".
   */
  function formatDisplayDate(value) {
    var date = normalizeInputDate(value);
    if (!date) {
      return '';
    }
    return Utilities.formatDate(date, timezone(), DISPLAY_DATE_FORMAT);
  }

  /**
   * Display format: "Aug 07, 2026 14:30".
   */
  function formatDisplayDateTime(value) {
    var date = normalizeInputDate(value);
    if (!date) {
      return '';
    }
    return Utilities.formatDate(date, timezone(), DISPLAY_DATETIME_FORMAT);
  }

  /**
   * Normalizes a Date, ISO string, or "yyyy-MM-dd" string to a Date.
   * Returns null when the value cannot be interpreted safely.
   */
  function normalizeInputDate(value) {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    var trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    var isoPattern = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;
    if (isoPattern.test(trimmed)) {
      var dateOnly = trimmed.indexOf('T') !== -1
        ? trimmed.substring(0, trimmed.indexOf('T'))
        : (trimmed.indexOf(' ') !== -1 ? trimmed.substring(0, trimmed.indexOf(' ')) : trimmed);
      var parts = dateOnly.split('-');
      if (parts.length === 3) {
        var year = Number(parts[0]);
        var month = Number(parts[1]);
        var day = Number(parts[2]);
        if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          var candidate = new Date(year, month - 1, day, 12, 0, 0);
          if (!isNaN(candidate.getTime())) {
            return candidate;
          }
        }
      }
    }
    return null;
  }

  function isValidDate(value) {
    return normalizeInputDate(value) !== null;
  }

  function isSameDay(a, b) {
    var da = normalizeInputDate(a);
    var db = normalizeInputDate(b);
    if (!da || !db) {
      return false;
    }
    return da.getFullYear() === db.getFullYear() &&
           da.getMonth() === db.getMonth() &&
           da.getDate() === db.getDate();
  }

  return {
    now: now,
    nowIso: nowIso,
    toIsoDate: toIsoDate,
    toIsoDateTime: toIsoDateTime,
    formatDisplayDate: formatDisplayDate,
    formatDisplayDateTime: formatDisplayDateTime,
    normalizeInputDate: normalizeInputDate,
    isValidDate: isValidDate,
    isSameDay: isSameDay
  };
})();

