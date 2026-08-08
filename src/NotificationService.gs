/**
 * NotificationService.gs
 * Thin wrapper over MailApp for system notifications (digest, alerts).
 *
 * Rules:
 * - Never logs the email body (may contain business details; audit
 *   summaries only).
 * - Test mode sends to the explicitly passed address with a [TEST]
 *   subject marker.
 * - All send failures are thrown back to the caller (DigestService /
 *   automation handlers record them in SyncLogs).
 */

var NotificationService = (function () {
  'use strict';

  /**
   * Sends a plain-text email.
   * @param {Object} message { to, subject, body, testMode? }
   * @return {Object} { ok: true, to, subject }
   */
  function sendEmail(message) {
    message = message || {};
    var to = String(message.to || '').trim();
    var subject = String(message.subject || '').trim();
    var body = String(message.body || '');
    if (!ValidationService.isEmail(to, 'recipient').valid) {
      throw ErrorService.create(
        ErrorService.CODES.DIGEST_RECIPIENT_INVALID,
        'The recipient address is not a valid email.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    if (!subject) {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'Email subject is required.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    MailApp.sendEmail(to, subject, body);
    return { ok: true, to: to, subject: subject };
  }

  return {
    sendEmail: sendEmail
  };
})();