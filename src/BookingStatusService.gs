/**
 * BookingStatusService.gs
 * Booking status state machine and status history (Sprint 3).
 *
 * Primary flow: INQUIRY -> TENTATIVE -> CONFIRMED -> COMPLETED -> ARCHIVED.
 * Cancellation from INQUIRY/TENTATIVE/CONFIRMED. PREPARING/READY/
 * IN_PROGRESS are reserved for later operations sprints.
 */

var BookingStatusService = (function () {
  'use strict';

  var STATUSES = [
    'INQUIRY', 'TENTATIVE', 'CONFIRMED', 'PREPARING', 'READY',
    'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED'
  ];

  var RESERVED = ['PREPARING', 'READY', 'IN_PROGRESS'];

  /**
   * Returns allowed target statuses for a current status.
   */
  function allowedTargets(current) {
    switch (current) {
      case 'INQUIRY':
        return ['TENTATIVE', 'CONFIRMED', 'CANCELLED', 'ARCHIVED'];
      case 'TENTATIVE':
        return ['CONFIRMED', 'CANCELLED', 'ARCHIVED'];
      case 'CONFIRMED':
        return ['COMPLETED', 'CANCELLED', 'ARCHIVED'];
      case 'COMPLETED':
        return ['ARCHIVED'];
      case 'CANCELLED':
        return ['ARCHIVED'];
      case 'ARCHIVED':
        return ['TENTATIVE']; // reactivation only
      default:
        return [];
    }
  }

  function isValidTransition(current, target) {
    if (String(current) === String(target)) {
      return true;
    }
    var targets = allowedTargets(String(current));
    return targets.indexOf(String(target)) !== -1;
  }

  function validateTransition(current, target, reason) {
    if (RESERVED.indexOf(String(target)) !== -1) {
      throw ErrorService.create(
        ErrorService.CODES.INVALID_BOOKING_STATUS_TRANSITION,
        'Status ' + target + ' is reserved for later operations sprints.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    if (String(current) === String(target)) {
      return;
    }
    if (!isValidTransition(current, target)) {
      throw ErrorService.create(
        ErrorService.CODES.INVALID_BOOKING_STATUS_TRANSITION,
        'Status change from ' + current + ' to ' + target + ' is not allowed.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    if (target === 'CANCELLED' && !ValidationService.trimSafe(reason)) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_CANCEL_REASON_REQUIRED,
        'A cancellation reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if ((current === 'ARCHIVED' || current === 'CANCELLED') && target === 'TENTATIVE' && !ValidationService.trimSafe(reason)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A reason is required when reactivating a booking.', null, ErrorService.CATEGORY_VALIDATION);
    }
  }

  function validateTransitionPreconditions(booking, target, reason, overrideReason) {
    if (target === 'CONFIRMED') {
      if (!booking.client_id) {
        throw ErrorService.create(ErrorService.CODES.BOOKING_CLIENT_REQUIRED,
          'A client is required to confirm a booking.', null, ErrorService.CATEGORY_VALIDATION);
      }
      if (!booking.event_date) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'An event date is required to confirm a booking.', null, ErrorService.CATEGORY_VALIDATION);
      }
      if (Number(booking.gross_booking_amount || 0) < 0) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'The booking total is not valid.', null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (target === 'COMPLETED') {
      var today = DateService.toIsoDate(DateService.now());
      if (String(booking.event_date || '') > today && !ValidationService.trimSafe(overrideReason)) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'The event date has not passed. Provide an override reason to complete this booking.',
          null, ErrorService.CATEGORY_VALIDATION);
      }
    }
  }

  /**
   * Records a status history row and audit entry.
   */
  function recordStatusChange(bookingId, previous, next, reason) {
    var actor = AuditService.getActor();
    var now = DateService.nowIso();
    BookingRepository.appendStatusHistory({
      status_history_id: IdService.generateId('STH'),
      booking_id: bookingId,
      previous_status: previous,
      new_status: next,
      reason: ValidationService.trimSafe(reason) || '',
      changed_at: now,
      changed_by: actor.userId
    });
    AuditService.info(AuditService.ACTIONS.BOOKING_STATUS_CHANGED, 'Bookings', bookingId,
      'Booking status changed from ' + previous + ' to ' + next + '.');
  }

  return {
    STATUSES: STATUSES.slice(0),
    RESERVED: RESERVED.slice(0),
    isValidTransition: isValidTransition,
    validateTransition: validateTransition,
    validateTransitionPreconditions: validateTransitionPreconditions,
    recordStatusChange: recordStatusChange
  };
})();

