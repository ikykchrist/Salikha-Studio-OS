/**
 * CalendarSyncService.gs
 * Google Calendar mirror for bookings (docs/PRODUCT_REQUIREMENTS.md §8,
 * docs/BUSINESS_WORKFLOWS.md). The calendar is a best-effort mirror, never
 * the source of truth for bookings.
 *
 * Rules:
 * - Eligible statuses: CONFIRMED / PREPARING / READY / IN_PROGRESS with an
 *   event date.
 * - CANCELLED / ARCHIVED bookings get their mirrored event deleted.
 * - The booking -> calendar-event mapping is stored in SyncLogs
 *   (sync_type=CALENDAR, entity_type=BOOKING, external_id=event id).
 * - Calendar failures never roll back bookings: they are recorded as
 *   FAILED in SyncLogs and retried by the daily automation job.
 * - The calendar ID lives in Script Properties only.
 */

var CalendarSyncService = (function () {
  'use strict';

  var ELIGIBLE_STATUSES = ['CONFIRMED', 'PREPARING', 'READY', 'IN_PROGRESS'];

  var EXTERNAL_TYPE = 'CALENDAR';

  var DEFAULT_EVENT_MINUTES = 120;

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
  }

  function isEligible(booking) {
    if (!booking) {
      return false;
    }
    if (ELIGIBLE_STATUSES.indexOf(booking.bookingStatus) === -1) {
      return false;
    }
    return !!booking.eventDate;
  }

  /**
   * Converts event_date (yyyy-mm-dd) plus an optional HH:mm time into a
   * business-timezone Date. Falls back to 18:00 when no time is given.
   */
  function toEventDate(dateValue, timeValue) {
    var base = DateService.normalizeInputDate(dateValue);
    if (!base) {
      return null;
    }
    if (timeValue) {
      var parts = String(timeValue).split(':');
      if (parts.length >= 2) {
        var h = Number(parts[0]);
        var m = Number(parts[1]);
        if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
        }
      }
    }
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 18, 0, 0);
  }

  function eventTitle(booking) {
    var code = booking.bookingCode || booking.bookingId || '';
    var title = booking.bookingTitle || 'Booking';
    return '[' + code + '] ' + title;
  }

  function eventDescription(booking) {
    var lines = [];
    lines.push('Booking: ' + (booking.bookingCode || booking.bookingId || ''));
    lines.push('Client: ' + (booking.clientId || ''));
    if (booking.venueName) {
      lines.push('Venue: ' + booking.venueName);
    }
    if (booking.cityMunicipality) {
      lines.push('City: ' + booking.cityMunicipality);
    }
    if (booking.setupTime) {
      lines.push('Setup minutes: ' + booking.setupTime);
    }
    return lines.join('\n');
  }

  /**
   * Finds the most recent OK calendar mapping row for a booking.
   */
  function lookupMapping(bookingId) {
    var rows = RepositoryService.findByField(SyncLogService.SHEET_NAME, 'entity_type', 'BOOKING');
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].entity_id !== bookingId) {
        continue;
      }
      if (rows[i].sync_type !== SyncLogService.TYPE_CALENDAR) {
        continue;
      }
      if (rows[i].status !== SyncLogService.STATUS_OK || !rows[i].external_id) {
        continue;
      }
      var currentStamp = String(rows[i].synced_at || rows[i].created_at || '');
      var bestStamp = best ? String(best.synced_at || best.created_at || '') : '';
      if (currentStamp > bestStamp) {
        best = rows[i];
      }
    }
    return best;
  }

  function lookupMirroredEventId(bookingId) {
    var mapping = lookupMapping(bookingId);
    return mapping ? mapping.external_id : null;
  }

  /**
   * Mirrors one booking into the calendar (create or update).
   * Never throws; records the outcome in SyncLogs.
   * @return {{status: string, eventId?: string, errorCode?: string}}
   */
  function syncBooking(booking) {
    try {
      assertDatabase();
      if (!CalendarService.isConfigured()) {
        SyncLogService.record({
          syncType: SyncLogService.TYPE_CALENDAR,
          entityType: 'BOOKING',
          entityId: booking.bookingId,
          status: SyncLogService.STATUS_SKIPPED,
          detail: 'CALENDAR_ID is not configured.'
        });
        return { status: SyncLogService.STATUS_SKIPPED };
      }
      if (ELIGIBLE_STATUSES.indexOf(booking.bookingStatus) === -1) {
        SyncLogService.record({
          syncType: SyncLogService.TYPE_CALENDAR,
          entityType: 'BOOKING',
          entityId: booking.bookingId,
          status: SyncLogService.STATUS_SKIPPED,
          detail: 'Booking is not eligible for mirroring (status ' + booking.bookingStatus + ').'
        });
        return { status: SyncLogService.STATUS_SKIPPED };
      }

      var start = toEventDate(booking.eventDate, booking.eventStartTime);
      if (!start) {
        SyncLogService.record({
          syncType: SyncLogService.TYPE_CALENDAR,
          entityType: 'BOOKING',
          entityId: booking.bookingId,
          status: SyncLogService.STATUS_FAILED,
          errorCode: ErrorService.CODES.CALENDAR_SYNC_FAILED,
          detail: 'The booking has no valid event date.'
        });
        AuditService.warn(AuditService.ACTIONS.CALENDAR_SYNC_FAILED, 'BOOKING', booking.bookingId, 'Calendar sync failed: the booking has no valid event date.');
        return { status: SyncLogService.STATUS_FAILED, errorCode: ErrorService.CODES.CALENDAR_SYNC_FAILED };
      }
      var end = toEventDate(booking.eventDate, booking.eventEndTime);
      if (!end || end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60000);
      }
      var title = eventTitle(booking);
      var description = eventDescription(booking);

      var existingEvent = null;
      var existingId = lookupMirroredEventId(booking.bookingId);
      if (existingId) {
        existingEvent = CalendarService.getEventOrNull(existingId);
      }

      var eventId = '';
      var created = false;
      if (existingEvent) {
        eventId = existingEvent.getId();
        existingEvent.setTitle(title);
        existingEvent.setTime(start, end);
        if (description) {
          existingEvent.setDescription(description);
        }
      } else {
        var createdEvent = CalendarService.createEvent({
          title: title,
          start: start,
          end: end,
          description: description
        });
        eventId = createdEvent.getId();
        created = true;
      }

      SyncLogService.record({
        syncType: SyncLogService.TYPE_CALENDAR,
        entityType: 'BOOKING',
        entityId: booking.bookingId,
        externalType: EXTERNAL_TYPE,
        externalId: eventId,
        status: SyncLogService.STATUS_OK,
        retryCount: 0,
        detail: (created ? 'Mirror created' : 'Mirror updated') + ' for ' + (booking.bookingCode || booking.bookingId) + '.'
      });
      if (created) {
        AuditService.info(AuditService.ACTIONS.CALENDAR_SYNCED, 'BOOKING', booking.bookingId, 'Booking mirrored to business calendar.', { eventId: eventId });
      } else {
        AuditService.info(AuditService.ACTIONS.CALENDAR_EVENT_UPDATED, 'BOOKING', booking.bookingId, 'Mirrored booking calendar event updated.', { eventId: eventId });
      }
      return { status: SyncLogService.STATUS_OK, eventId: eventId };
    } catch (err) {
      var safe = ErrorService.normalize(err);
      SyncLogService.record({
        syncType: SyncLogService.TYPE_CALENDAR,
        entityType: 'BOOKING',
        entityId: booking.bookingId,
        externalType: EXTERNAL_TYPE,
        status: SyncLogService.STATUS_FAILED,
        retryCount: 1,
        errorCode: safe.code || ErrorService.CODES.CALENDAR_SYNC_FAILED,
        detail: (safe.message || 'Calendar sync failed.').slice(0, 300)
      });
      AuditService.warn(AuditService.ACTIONS.CALENDAR_SYNC_FAILED, 'BOOKING', booking.bookingId, 'Calendar sync failed: ' + (safe.message || 'unknown error.'));
      return { status: SyncLogService.STATUS_FAILED, errorCode: safe.code || ErrorService.CODES.CALENDAR_SYNC_FAILED };
    }
  }

  /**
   * Deletes the mirrored event for a cancelled/archived booking.
   * Never throws; outcome recorded in SyncLogs.
   */
  function removeBookingEvent(booking) {
    try {
      assertDatabase();
      var existingId = lookupMirroredEventId(booking.bookingId);
      if (!existingId) {
        return { status: SyncLogService.STATUS_SKIPPED };
      }
      if (!CalendarService.hasEvent(existingId)) {
        // Event already gone (was deleted or removed earlier): the end state
        // is achieved, so removal is a no-op. Never an endless FAILED retry.
        SyncLogService.record({
          syncType: SyncLogService.TYPE_CALENDAR,
          entityType: 'BOOKING',
          entityId: booking.bookingId,
          externalType: EXTERNAL_TYPE,
          externalId: existingId,
          status: SyncLogService.STATUS_SKIPPED,
          detail: 'Mirrored event already removed for ' + (booking.bookingCode || booking.bookingId) + '.'
        });
        return { status: SyncLogService.STATUS_SKIPPED };
      }
      CalendarService.deleteEvent(existingId);
      SyncLogService.record({
        syncType: SyncLogService.TYPE_CALENDAR,
        entityType: 'BOOKING',
        entityId: booking.bookingId,
        externalType: EXTERNAL_TYPE,
        externalId: existingId,
        status: SyncLogService.STATUS_OK,
        detail: 'Mirrored event removed for ' + (booking.bookingCode || booking.bookingId) + '.'
      });
      AuditService.info(AuditService.ACTIONS.CALENDAR_EVENT_CANCELLED, 'BOOKING', booking.bookingId, 'Mirrored calendar event removed.', { eventId: existingId });
      return { status: SyncLogService.STATUS_OK, eventId: existingId };
    } catch (err) {
      var safeErr = ErrorService.normalize(err);
      SyncLogService.record({
        syncType: SyncLogService.TYPE_CALENDAR,
        entityType: 'BOOKING',
        entityId: booking.bookingId,
        status: SyncLogService.STATUS_FAILED,
        errorCode: safeErr.code || ErrorService.CODES.CALENDAR_SYNC_FAILED,
        detail: (safeErr.message || 'Calendar event removal failed.').slice(0, 300)
      });
      AuditService.warn(AuditService.ACTIONS.CALENDAR_SYNC_FAILED, 'BOOKING', booking.bookingId, 'Calendar event removal failed: ' + (safeErr.message || 'unknown error.'));
      return { status: SyncLogService.STATUS_FAILED, errorCode: safeErr.code || ErrorService.CODES.CALENDAR_SYNC_FAILED };
    }
  }

  /**
   * Syncs every eligible booking (daily automation job; retries previous
   * failures because syncs are idempotent).
   */
  function syncAllEligible() {
    var summary = { ok: 0, failed: 0, skipped: 0, total: 0 };
    if (!DatabaseService.isInitialized()) {
      return summary;
    }
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    for (var i = 0; i < records.length; i++) {
      var booking = RepositoryService.toPublicRecord(records[i]);
      if (!isEligible(booking)) {
        continue;
      }
      summary.total++;
      var result = syncBooking(booking);
      if (result.status === SyncLogService.STATUS_OK) {
        summary.ok++;
      } else if (result.status === SyncLogService.STATUS_FAILED) {
        summary.failed++;
      } else {
        summary.skipped++;
      }
    }
    return summary;
  }

  return {
    ELIGIBLE_STATUSES: ELIGIBLE_STATUSES.slice(0),
    isEligible: isEligible,
    syncBooking: syncBooking,
    removeBookingEvent: removeBookingEvent,
    syncAllEligible: syncAllEligible
  };
})();