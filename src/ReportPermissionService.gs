/**
 * ReportPermissionService.gs
 * Authorization gate for report access (Sprint 7).
 *
 * Posture: full role-based authorization is not implemented yet (the
 * Users sheet arrives in a future sprint). Like every Sprint 1-6
 * service, this gate records the acting user and validates the report
 * identifier. It is deliberately small and clearly marked as a
 * temporary boundary - see docs/SECURITY_MODEL.md Sec 2.1.
 *
 * Every report export writes an audit entry, and the gate is the place
 * where role checks land when auth is enabled.
 */

var ReportPermissionService = (function () {
  'use strict';

  // Registry of report IDs that may be generated. Unknown IDs are
  // rejected before any data is read.
  var KNOWN_REPORT_IDS = [
    'cashflow',
    'income-statement',
    'receivables',
    'revenue-by-service',
    'revenue-by-package',
    'booking-profitability',
    'expense-breakdown',
    'inventory-valuation',
    'inventory-movements',
    'low-stock',
    'equipment-status',
    'partner-commissions',
    'crew-payments',
    'daily-reconciliation',
    'cash-conversion-summary'
  ];

  /**
   * Returns the acting user (temporary actor, never a security boundary
   * on its own - services that mutate enforce their own rules).
   */
  function getActor() {
    return AuditService.getActor();
  }

  /**
   * Validates that the requested report ID is a known report.
   * Throws REPORT_NOT_FOUND when unknown.
   */
  function requireReportAccess(reportId) {
    if (KNOWN_REPORT_IDS.indexOf(reportId) === -1) {
      throw ErrorService.create(
        ErrorService.CODES.REPORT_NOT_FOUND,
        'The requested report does not exist: ' + reportId + '.',
        { reportId: reportId },
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return true;
  }

  return {
    getActor: getActor,
    requireReportAccess: requireReportAccess
  };
})();