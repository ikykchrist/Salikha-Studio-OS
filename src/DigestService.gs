/**
 * DigestService.gs
 * Weekly (and on-demand) digest email (docs/PRODUCT_REQUIREMENTS.md §22).
 *
 * Sections:
 * - Upcoming events in the next 7 days (active bookings only)
 * - Outstanding receivables (total + first 15)
 * - Expenses pending approval (SUBMITTED, first 15)
 * - Low-stock items (R11 low-stock report, first 15)
 * - Deployments still open (RETURNED/RECONCILED, first 15)
 * - Recent sync failures (first 10)
 *
 * Rules:
 * - Recipients come from SystemMetadata DIGEST_RECIPIENTS (comma-separated).
 * - Test mode sends to a single explicit recipient with a [TEST] subject.
 * - Delivery and failures are recorded in SyncLogs + AuditLogs.
 */

var DigestService = (function () {
  'use strict';

  var META_RECIPIENTS = 'DIGEST_RECIPIENTS';

  var TEST_SUBJECT_PREFIX = '[TEST] ';

  var EXCLUDED_DIGEST_STATUSES = ['CANCELLED', 'ARCHIVED'];

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function money(value) {
    return 'PHP ' + round2D(value).toFixed(2);
  }

  function round2D(value) {
    return round2(value);
  }

  function todayIso() {
    return DateService.toIsoDate(DateService.now());
  }

  function isWithinDays(isoDate, days) {
    var target = DateService.normalizeInputDate(isoDate);
    var today = DateService.normalizeInputDate(todayIso());
    if (!target || !today) {
      return false;
    }
    var diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    return diff >= 0 && diff <= days;
  }

  /**
   * Upcoming events: all bookings (read directly so the automation is not
   * limited by list pagination) whose status is active and whose event date
   * falls in [today, today+days].
   */
  function upcomingEvents(days) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
var status = String(r.booking_status || '');
      if (EXCLUDED_DIGEST_STATUSES.indexOf(status) !== -1) {
        continue;
      }
      if (!isWithinDays(r.event_date, days)) {
        continue;
      }
      out.push({
        code: r.booking_code || r.booking_id,
        title: r.booking_title || '',
        eventDate: r.event_date || '',
        venue: r.venue_name || ''
      });
    }
    out.sort(function (a, b) {
      return String(a.eventDate).localeCompare(String(b.eventDate));
    });
    return out;
  }

  function outstandingRows() {
    var result = ReceivableService.listReceivables({ mode: 'outstanding', page: 1, pageSize: 100 });
    var rows = (result && result.items) || [];
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      total += round2D(rows[i].balanceDue);
    }
    return { rows: rows, total: total };
  }

  function pendingExpenseRows() {
    var result = ExpenseRepository.listExpenses({ status: 'SUBMITTED', page: 1, pageSize: 100 });
    return (result && result.items) || [];
  }

  function lowStockRows() {
    try {
      var report = InventoryReportService.runLowStock({});
      return (report && report.rows) || [];
    } catch (err) {
      return [];
    }
  }

  function openDeploymentRows() {
    var records = RepositoryService.readAll(DeploymentRepository.SHEET_DEPLOYMENTS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var status = String(records[i].status || '');
      if (status !== 'RETURNED' && status !== 'RECONCILED') {
        continue;
      }
      out.push({
        code: records[i].deployment_id,
        bookingId: records[i].booking_id || '',
        status: status
      });
    }
    return out;
  }

  function failureRows() {
    return SyncLogService.recentFailures(25);
  }

  /**
   * Builds the digest sections. Returns an array of
   * { title, lines } objects (empty when nothing to report).
   */
  function buildSections() {
    var sections = [];
    var upcoming = upcomingEvents(7);
    if (upcoming.length > 0) {
      sections.push({
        title: 'Upcoming events (next 7 days)',
        lines: upcoming.map(function (b) {
          return b.eventDate + '  ' + b.code + (b.title ? ' - ' + b.title : '') + (b.venue ? ' @ ' + b.venue : '');
        })
      });
    }
    var receivables = outstandingRows();
    if (receivables.rows.length > 0) {
      sections.push({
        title: 'Outstanding receivables - ' + money(receivables.total),
        lines: receivables.rows.slice(0, 15).map(function (r) {
          return r.eventDate + '  ' + (r.bookingCode || r.bookingId) + '  balance ' + money(r.balanceDue);
        })
      });
    }
    var expenses = pendingExpenseRows();
    if (expenses.length > 0) {
      sections.push({
        title: 'Expenses pending approval',
        lines: expenses.slice(0, 15).map(function (e) {
          return (e.expenseCode || e.expenseId) + '  ' + (e.description || '') + '  ' + money(e.grossAmount);
        })
      });
    }
    var lowStock = lowStockRows();
    if (lowStock.length > 0) {
      sections.push({
        title: 'Low stock',
        lines: lowStock.slice(0, 15).map(function (item) {
          return item.sku + '  ' + item.itemName + '  on hand ' + item.onHand + ' / reorder ' + item.reorderLevel;
        })
      });
    }
    var deployments = openDeploymentRows();
    if (deployments.length > 0) {
      sections.push({
        title: 'Deployments still open',
        lines: deployments.slice(0, 15).map(function (d) {
          return d.code + '  ' + d.status + (d.bookingId ? '  (booking ' + d.bookingId + ')' : '');
        })
      });
    }
    var failures = failureRows();
    if (failures.length > 0) {
      sections.push({
        title: 'Recent sync failures',
        lines: failures.slice(0, 10).map(function (f) {
          return f.syncType + ' ' + f.entityType + ' ' + (f.entityId || '') + ' - ' + (f.detail || '');
        })
      });
    }
    return sections;
  }

/**
   * Renders the plain-text digest body.
   * @param {string} periodLabel Human-readable period label.
   * @param {Array} [sections] Optional pre-built sections (avoids a second
   *   data pass when the caller already built them, e.g. sendDigest).
   */
  function renderDigest(periodLabel, sections) {
    sections = sections || buildSections();
    var lines = ['Salikha Studio OS - weekly digest (' + periodLabel + ')', ''];
    if (sections.length === 0) {
      lines.push('No activity to report this period.');
    }
    for (var i = 0; i < sections.length; i++) {
      lines.push('-- ' + sections[i].title + ' --');
      for (var j = 0; j < sections[i].lines.length; j++) {
        lines.push('  ' + sections[i].lines[j]);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Resolves the recipient list. Test mode: single explicit address.
   * @param {string|null} testRecipient Explicit recipient (test mode).
   * @return {string[]} Non-empty recipient list (validated).
   */
  function resolveRecipients(testRecipient) {
    if (testRecipient) {
      var single = String(testRecipient).trim();
      if (!ValidationService.isEmail(single, 'recipient').valid) {
        throw ErrorService.create(
          ErrorService.CODES.DIGEST_RECIPIENT_INVALID,
          'The recipient address is not a valid email.',
          null,
          ErrorService.CATEGORY_VALIDATION
        );
      }
      return [single];
    }
    var existing = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, META_RECIPIENTS);
    var raw = existing ? String(existing.metadata_value || '') : '';
    var recipients = raw.split(',').map(function (s) {
      return s.trim();
    }).filter(function (s) {
      return s.length > 0;
    });
    if (recipients.length === 0) {
      throw ErrorService.create(
        ErrorService.CODES.AUTOMATION_NOT_CONFIGURED,
        'No digest recipients are configured. Set DIGEST_RECIPIENTS in Settings.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    return recipients;
  }

  /**
   * Sends the digest to every configured (or test) recipient.
   * Never throws: per-recipient failures are recorded and reported.
   * @param {Object} [opts] { testRecipient }
   * @return {{ sent: number, failed: number, results: Array }}
   */
  function sendDigest(opts) {
    opts = opts || {};
    if (!DatabaseService.isInitialized()) {
      return { sent: 0, failed: 0, results: [] };
    }
    var periodLabel = todayIso();
    var subject = 'Salikha Studio weekly digest - ' + periodLabel;
    if (opts.testRecipient) {
      subject = TEST_SUBJECT_PREFIX + subject;
    }
    var sections = buildSections();
    var body = renderDigest(periodLabel, sections);
    if (sections.some(function (s) { return s.title === 'Low stock'; })) {
      AuditService.info(AuditService.ACTIONS.LOW_STOCK_ALERT_SENT, 'INVENTORY', '', 'Low-stock alert included in the weekly digest.');
    }
    var recipients = resolveRecipients(opts.testRecipient || null);
    var results = [];
    var failures = 0;
    for (var i = 0; i < recipients.length; i++) {
      var recipient = recipients[i];
      try {
        NotificationService.sendEmail({ to: recipient, subject: subject, body: body, testMode: !!opts.testRecipient });
        results.push({ recipient: recipient, ok: true });
        AuditService.info(AuditService.ACTIONS.DIGEST_SENT, 'EMAIL', recipient, 'weekly digest sent to ' + recipient + '.');
        SyncLogService.record({
          syncType: SyncLogService.TYPE_EMAIL,
          entityType: 'DIGEST',
          entityId: recipient,
          status: SyncLogService.STATUS_OK,
          detail: 'Digest sent to: ' + recipient
        });
      } catch (err) {
        failures++;
        results.push({ recipient: recipient, ok: false });
        AuditService.warn(AuditService.ACTIONS.DIGEST_FAILED, 'EMAIL', recipient, 'Digest failed for ' + recipient + '.');
        SyncLogService.record({
          syncType: SyncLogService.TYPE_EMAIL,
          entityType: 'DIGEST',
          entityId: recipient,
          status: SyncLogService.STATUS_FAILED,
          errorCode: ErrorService.CODES.DIGEST_SEND_FAILED,
          detail: 'Digest send failed for: ' + recipient
        });
      }
    }
    return { sent: results.length - failures, failed: failures, results: results };
  }

  return {
    META_RECIPIENTS: META_RECIPIENTS,
    buildSections: buildSections,
    renderDigest: renderDigest,
    resolveRecipients: resolveRecipients,
    sendDigest: sendDigest,
    upcomingEvents: upcomingEvents
  };
})();