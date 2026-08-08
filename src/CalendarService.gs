/**
 * CalendarService.gs
 * Read/write access to the business Google Calendar.
 *
 * Rules (docs/PRODUCT_REQUIREMENTS.md §8, docs/SECURITY_MODEL.md §9.1):
 * - The calendar ID lives only in Script Properties (CALENDAR_ID), never
 *   in code and never returned to the frontend.
 * - The calendar is a best-effort mirror; bookings are the truth.
 * - Calendar failures are logged (SyncLogs) and never roll back bookings.
 */

var CalendarService = (function () {
  'use strict';

  var CALENDAR_ID_KEY = 'CALENDAR_ID';

  function getCalendarId() {
    var id = Config.get(CALENDAR_ID_KEY);
    if (!id) {
      throw ErrorService.create(
        ErrorService.CODES.CALENDAR_NOT_CONFIGURED,
        'The business calendar is not configured. Set CALENDAR_ID in Script Properties.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    return id;
  }

  function getCalendar() {
    var id = getCalendarId();
    var calendar = CalendarApp.getCalendarById(id);
    if (!calendar) {
      throw ErrorService.create(
        ErrorService.CODES.CALENDAR_NOT_CONFIGURED,
        'The configured calendar could not be opened.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    return calendar;
  }

  function createEvent(opts) {
    var calendar = getCalendar();
    var event = calendar.createEvent(opts.title, opts.start, opts.end, {
      description: opts.description || '',
      location: opts.location || ''
    });
    if (!event || !event.getId()) {
      throw ErrorService.create(ErrorService.CODES.CALENDAR_SYNC_FAILED, 'The calendar event could not be created.', null, ErrorService.CATEGORY_INTEGRATION);
    }
    return event;
  }

  function getEvent(eventId) {
    if (!eventId) {
      return null;
    }
    var calendar = getCalendar();
    return calendar.getEventById(eventId);
  }

  function hasEvent(eventId) {
    return !!getEventOrNull(eventId);
  }

  function getEventOrNull(eventId) {
    try {
      var calendar = getCalendar();
      return calendar.getEventById(eventId) || null;
    } catch (err) {
      return null;
    }
  }

  function deleteEvent(eventId) {
    var calendar = getCalendar();
    var event = calendar.getEventById(eventId);
    if (!event) {
      return false;
    }
    event.deleteEvent();
    return true;
  }

  function isConfigured() {
    try {
      return !!Config.get(CALENDAR_ID_KEY);
    } catch (err) {
      return false;
    }
  }

  return {
    CALENDAR_ID_KEY: CALENDAR_ID_KEY,
    getCalendarId: getCalendarId,
    getCalendar: getCalendar,
    createEvent: createEvent,
    getEventOrNull: getEventOrNull,
    hasEvent: hasEvent,
    deleteEvent: deleteEvent,
    isConfigured: isConfigured
  };
})();