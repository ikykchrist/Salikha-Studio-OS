/**
 * BookingConflictService.gs
 * Internal schedule-conflict detection (Sprint 3). Warnings only - the
 * caller may require an override reason before saving. Google Calendar
 * is never queried.
 */

var BookingConflictService = (function () {
  'use strict';

  function timeToMinutes(value) {
    var text = String(value || '');
    var parts = text.split(':');
    if (parts.length < 2) {
      return null;
    }
    var hours = Number(parts[0]);
    var minutes = Number(parts[1]);
    if (isNaN(hours) || isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  }

  function setupMinutes(value) {
    var num = Number(value || 0);
    return isNaN(num) ? 0 : num;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    if (startA === null || endA === null || startB === null || endB === null) {
      return false;
    }
    return startA < endB && startB < endA;
  }

  /**
   * Checks a proposed schedule against stored bookings.
   *
   * @param {Object} proposal { eventDate, eventStartTime, eventEndTime,
   *   setupTime, serviceType, assignedOwner, excludeBookingId }
   * @return {Object[]} Conflict entries (booking code, title, times, status).
   */
  function checkConflicts(proposal) {
    var eventDate = proposal.eventDate;
    if (!eventDate) {
      return [];
    }
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var startA = timeToMinutes(proposal.eventStartTime);
    var endA = timeToMinutes(proposal.eventEndTime);
    var setupA = setupMinutes(proposal.setupTime);
    var conflicts = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.event_date) !== String(eventDate)) {
        continue;
      }
      if (String(r.booking_status) === 'CANCELLED' || String(r.booking_status) === 'ARCHIVED') {
        continue;
      }
      if (proposal.excludeBookingId && String(r.booking_id) === String(proposal.excludeBookingId)) {
        continue;
      }
      var sameService = !proposal.serviceType || !r.service_type ||
        String(proposal.serviceType) === String(r.service_type);
      var sameOwner = !proposal.assignedOwner || !r.assigned_owner ||
        String(proposal.assignedOwner) === String(r.assigned_owner);
      if (!sameService && !sameOwner) {
        continue;
      }
      var startB = timeToMinutes(r.event_start_time);
      var endB = timeToMinutes(r.event_end_time);
      var setupB = setupMinutes(r.setup_time);
      var effectiveStartA = startA === null ? null : startA - setupA;
      var effectiveStartB = startB === null ? null : startB - setupB;
      var overlaps = rangesOverlap(effectiveStartA, endA, effectiveStartB, endB);
      if (!overlaps && startA === null && startB === null) {
        // same date with no times on either side: informational only
        overlaps = false;
      }
      if (overlaps) {
        conflicts.push({
          bookingId: r.booking_id,
          bookingCode: r.booking_code,
          bookingTitle: r.booking_title || '',
          eventStartTime: r.event_start_time || '',
          eventEndTime: r.event_end_time || '',
          bookingStatus: r.booking_status,
          sameService: sameService,
          sameOwner: sameOwner
        });
      }
    }
    return conflicts;
  }

  return {
    checkConflicts: checkConflicts,
    timeToMinutes: timeToMinutes
  };
})();
