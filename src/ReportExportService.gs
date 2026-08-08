/**
 * ReportExportService.gs
 * Safe CSV export for reports (Sprint 7).
 *
 * - Formula injection neutralization: cells whose text starts with a
 *   spreadsheet formula character (=, +, -, @) are prefixed, so a CSV
 *   opened in a spreadsheet application can never execute as a formula.
 * - Quotes and commas are escaped per RFC 4180.
 * - Money cells are exported as plain numbers (already rounded).
 * - Detail rows are capped (MAX_ROWS) with an honest `truncated` flag.
 */

var ReportExportService = (function () {
  'use strict';

  var MAX_ROWS = 2000;
  var FORMULA_START = /^[=+\-@\t\r]/;

  /**
   * Neutralizes formula injection on a text cell.
   */
  function sanitizeText(value) {
    var text = String(value);
    if (FORMULA_START.test(text)) {
      return "'" + text;
    }
    return text;
  }

  /**
   * Renders one cell per RFC 4180.
   */
  function cell(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    var text = sanitizeText(value);
    if (text.indexOf('"') !== -1 || text.indexOf(',') !== -1 ||
        text.indexOf('\n') !== -1 || text.indexOf('\r') !== -1) {
      text = '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  /**
   * Builds a CSV body from report rows.
   * @param {Array} rows - array of objects; keys become columns.
   * @param {Array} columns - optional ordered column keys.
   */
  function buildCsv(rows, columns) {
    rows = rows || [];
    columns = columns || (rows.length ? Object.keys(rows[0]) : []);

    var lines = [];
    lines.push(columns.map(cell).join(','));

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var values = [];
      for (var c = 0; c < columns.length; c++) {
        values.push(cell(row ? row[columns[c]] : undefined));
      }
      lines.push(values.join(','));
    }
    return lines.join('\r\n');
  }

  /**
   * Exports a report object to CSV.
   * @param {Object} report - payload from a report service (rows at least).
   * @param {string} nameTag - optional report identifier used in the
   *   filename (defaults to the payload 'report' code, e.g. R2).
   * @return {Object} { csv, filename, rowCount, truncated }
   */
  function toCsv(report, nameTag) {
    if (!report || !report.rows) {
      throw ErrorService.create(
        ErrorService.CODES.REPORT_EXPORT_FAILED,
        'The report has no rows to export.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    var allRows = report.rows;
    var truncated = allRows.length > MAX_ROWS;
    var rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;

    var columns = report.columns || (rows.length ? Object.keys(rows[0]) : []);
    var csv = buildCsv(rows, columns);

    return {
      csv: csv,
      filename: 'salikha-' + (nameTag || report.report || 'report') + '-' + todayStamp() + '.csv',
      rowCount: rows.length,
      truncated: truncated,
      columns: columns
    };
  }

  function todayStamp() {
    return ReportFilterService.today();
  }

  return {
    MAX_ROWS: MAX_ROWS,
    sanitizeText: sanitizeText,
    cell: cell,
    buildCsv: buildCsv,
    toCsv: toCsv
  };
})();