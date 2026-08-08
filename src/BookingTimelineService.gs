/**
 * BookingTimelineService.gs
 * Booking timeline: merges status history, schedule history, payments,
 * and audit entries into one chronological feed (Sprint 3).
 */

var BookingTimelineService = (function () {
  'use strict';

  function entry(time, type, title, detail) {
    return {
      time: time || '',
      type: type,
      title: title,
      detail: detail || ''
    };
  }

  function getBookingTimeline(bookingId) {
    var timeline = [];

    var statusHistory = BookingRepository.listStatusHistory(bookingId);
    for (var s = 0; s < statusHistory.length; s++) {
      var sh = statusHistory[s];
      timeline.push(entry(sh.changedAt, 'STATUS',
        'Status changed: ' + sh.previousStatus + ' -> ' + sh.newStatus,
        sh.reason || ''));
    }

    var scheduleHistory = BookingRepository.listScheduleHistory(bookingId);
    for (var sc = 0; sc < scheduleHistory.length; sc++) {
      var sch = scheduleHistory[sc];
      timeline.push(entry(sch.changedAt, 'SCHEDULE',
        'Rescheduled: ' + (sch.previousEventDate || '?') + ' -> ' + (sch.newEventDate || '?'),
        sch.reason || ''));
    }

    var payments = RepositoryService.findByField(SheetSchemaService.SHEET_PAYMENTS, 'booking_id', bookingId);
    for (var p = 0; p < payments.length; p++) {
      var pay = payments[p];
      timeline.push(entry(pay.payment_datetime || pay.payment_date, 'PAYMENT',
        'Payment ' + (String(pay.status) === 'VOIDED' ? 'voided' : 'recorded') + ': ' + Number(pay.amount || 0).toFixed(2),
        pay.reference_number || ''));
    }

    var refunds = RepositoryService.findByField(SheetSchemaService.SHEET_REFUNDS, 'booking_id', bookingId);
    for (var r = 0; r < refunds.length; r++) {
      var rf = refunds[r];
      timeline.push(entry(rf.created_at || rf.refund_date, 'REFUND',
        'Refund ' + (String(rf.status) === 'VOIDED' ? 'voided' : 'recorded') + ': ' + Number(rf.amount || 0).toFixed(2),
        rf.reason || ''));
    }

    var audits = RepositoryService.findByField(SheetSchemaService.SHEET_AUDIT_LOGS, 'entity_id', bookingId);
    for (var a = 0; a < audits.length; a++) {
      var au = audits[a];
      if (String(au.entity_type) !== 'Bookings') {
        continue;
      }
      var action = String(au.action || '');
      if (action === 'BOOKING_STATUS_CHANGED' || action === 'PAYMENT_RECORDED' ||
          action === 'PAYMENT_VOIDED' || action === 'REFUND_RECORDED') {
        continue; // already represented above
      }
      timeline.push(entry(au.timestamp, 'AUDIT', action, au.summary || ''));
    }

    timeline.sort(function (a, b) {
      return String(a.time).localeCompare(String(b.time));
    });
    return timeline;
  }

  return {
    getBookingTimeline: getBookingTimeline
  };
})();
