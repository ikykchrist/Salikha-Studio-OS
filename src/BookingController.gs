/**
 * BookingController.gs
 * Server entry points for bookings (Sprint 3). Totals are always
 * recalculated server-side; no row numbers or property values exposed.
 */

function getBookings(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingRepository.listBookings(filters || {}), 'Bookings retrieved.');
  })();
}

function getBooking(bookingId) {
  return ErrorService.wrap(function () {
    var booking = BookingRepository.getBooking(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    booking.items = BookingRepository.listItems(bookingId);
    return ResponseService.success(booking, 'Booking retrieved.');
  })();
}

function createBooking(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.createBooking(payload || {}), 'Booking created. No cash movement occurred.');
  })();
}

function updateBooking(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.updateBooking(payload || {}), 'Booking updated.');
  })();
}

function changeBookingStatus(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.changeBookingStatus(payload || {}), 'Booking status updated.');
  })();
}

function cancelBooking(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.cancelBooking(payload || {}), 'Booking cancelled. Payments and history preserved.');
  })();
}

function archiveBooking(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.archiveBooking(payload || {}), 'Booking archived.');
  })();
}

function reactivateBooking(bookingId, reason) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.reactivateBooking(bookingId, reason), 'Booking reactivated.');
  })();
}

function rescheduleBooking(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.rescheduleBooking(payload || {}), 'Booking rescheduled. Previous schedule preserved.');
  })();
}

function checkBookingConflicts(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.checkBookingConflicts(payload || {}), 'Conflict check completed.');
  })();
}

function calculateBookingPricing(payload) {
  return ErrorService.wrap(function () {
    var pricing = BookingService.buildPricingPayload(payload || {});
    return ResponseService.success(BookingPricingService.calculatePricing(pricing), 'Pricing calculated.');
  })();
}

function getBookingTimeline(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingTimelineService.getBookingTimeline(bookingId), 'Booking timeline retrieved.');
  })();
}

function getBookingSummary(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.getBookingSummary(), 'Booking summary retrieved.');
  })();
}

function verifyBookingBalances(repair) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingService.verifyBookingBalances(repair === true), 'Booking balance verification completed.');
  })();
}
