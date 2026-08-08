/**
 * ResponseService.gs
 * Standard response envelope for all server functions.
 *
 * Success: { success:true,  data, message, error:null,  timestamp }
 * Failure: { success:false, data:null, message, error:{code,details}, timestamp }
 *
 * Stack traces and secrets are never included in client responses.
 */

var ResponseService = (function () {
  'use strict';

  function nowIso() {
    return DateService.nowIso();
  }

  /**
   * Builds a success response.
   */
  function success(data, message) {
    return {
      success: true,
      data: data !== undefined ? data : null,
      message: message || 'Operation completed.',
      error: null,
      timestamp: nowIso()
    };
  }

  /**
   * Builds a failure response from a raw error.
   * Normalizes through ErrorService so codes are stable and messages are safe.
   */
  function failure(err, fallbackMessage) {
    var safe = ErrorService.normalize(err);
    var message = ErrorService.toUserMessage(safe) || fallbackMessage || 'Operation failed.';
    var details = ErrorService.toSafeDetails(safe);
    return {
      success: false,
      data: null,
      message: message,
      error: {
        code: safe.code || 'INTERNAL_ERROR',
        details: details.details || null
      },
      timestamp: nowIso()
    };
  }

  return {
    success: success,
    failure: failure
  };
})();
