/**
 * ReportController.gs
 * Server entry points for the Reports interface and the owner
 * dashboard (Sprint 7).
 *
 * All functions return the standard response envelope and never leak
 * stack traces, sheet IDs, or secrets. CSV export is audited; report
 * reads are not (docs/SECURITY_MODEL.md Sec 5).
 */

function getReportList() {
  return ErrorService.wrap(function () {
    return ResponseService.success(ReportService.listReports(), 'Reports catalog retrieved.');
  })();
}

/**
 * @param {Object} payload { reportId, filters }
 */
function getReportData(payload) {
  return ErrorService.wrap(function () {
    payload = payload || {};
    var result = ReportService.run(payload.reportId, payload.filters || {});
    return ResponseService.success(result, 'Report generated.');
  })();
}

/**
 * Exports a report as CSV (formula-safe). Audited.
 * @param {Object} payload { reportId, filters }
 */
function exportReportCsv(payload) {
  return ErrorService.wrap(function () {
    payload = payload || {};
    var result = ReportService.run(payload.reportId, payload.filters || {});
    var csv = ReportExportService.toCsv(result.payload, result.reportId);
    AuditService.info(
      AuditService.ACTIONS.REPORT_EXPORTED,
      'report',
      result.reportId,
      'Report exported to CSV: ' + result.reportName + ' (' + csv.filename + ')',
      {
        metadata: {
          reportId: result.reportId,
          rows: csv.rowCount,
          truncated: csv.truncated,
          filters: payload.filters || {}
        }
      }
    );
    return ResponseService.success(csv, 'Report exported.');
  })();
}

/**
 * R1 owner dashboard data.
 */
function getDashboardData() {
  return ErrorService.wrap(function () {
    return ResponseService.success(DashboardService.getDashboardData(), 'Dashboard data refreshed.');
  })();
}