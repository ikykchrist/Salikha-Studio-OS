/**
 * SyncLogService.gs
 * Append-only log of external sync attempts (calendar mirror, backup,
 * digests). Backs the SyncLogs sheet (docs/DATABASE_SCHEMA.md §2.6).
 *
 * Statuses: OK | FAILED | SKIPPED
 * Sync types: CALENDAR | BACKUP | EMAIL
 * Recording never throws - the caller's primary operation must not break
 * because bookkeeping failed.
 */

var SyncLogService = (function () {
  'use strict';

  var SHEET_NAME = SheetSchemaService.SHEET_SYNC_LOGS;

  var STATUS_OK = 'OK';
  var STATUS_FAILED = 'FAILED';
  var STATUS_SKIPPED = 'SKIPPED';

  var TYPE_CALENDAR = 'CALENDAR';
  var TYPE_BACKUP = 'BACKUP';
  var TYPE_EMAIL = 'EMAIL';

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

  function nowIso() {
    return DateService.nowIso();
  }

  /**
   * Records one sync outcome. Never throws.
   * @param {Object} opts {syncType, entityType, entityId, externalType,
   *                       externalId, status, detail, errorCode, retryCount}
   * @return {Object|null} the row (public shape) or null on failure.
   */
  function record(opts) {
    try {
      assertDatabase();
      var now = nowIso();
      var row = {
        sync_id: IdService.generateId('SYN'),
        sync_type: opts.syncType || TYPE_CALENDAR,
        entity_type: String(opts.entityType || ''),
        entity_id: String(opts.entityId || ''),
        external_type: String(opts.externalType || ''),
        external_id: String(opts.externalId || ''),
        status: opts.status || STATUS_OK,
        detail: String(opts.detail || '').slice(0, 500),
        error_code: String(opts.errorCode || ''),
        retry_count: Number(opts.retryCount) || 0,
        synced_at: now,
        created_at: now,
        updated_at: now
      };
      RepositoryService.appendRecord(SHEET_NAME, row);
      return row;
    } catch (err) {
      LoggerService.error('SyncLogService.record', 'Failed to write sync log entry', {
        syncType: opts && opts.syncType,
        detail: String(opts && opts.detail || '').slice(0, 200)
      });
      return null;
    }
  }

  /**
   * Most recent entries, newest first.
   */
  function listRecent(limit) {
    assertDatabase();
    var rows = RepositoryService.readAll(SHEET_NAME);
    rows.sort(function (a, b) {
      var cmp = String(b.synced_at || '').localeCompare(String(a.synced_at || ''));
      if (cmp === 0) {
        cmp = (Number(b.__rowIndex) || 0) - (Number(a.__rowIndex) || 0);
      }
      return cmp;
    });
    var max = Number(limit) > 0 ? Number(limit) : 50;
    return rows.slice(0, max);
  }

  function countByStatus(status) {
    assertDatabase();
    var rows = RepositoryService.readAll(SHEET_NAME);
    var count = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].status === status) {
        count++;
      }
    }
    return count;
  }

  function recentFailures(limit) {
    var rows = listRecent(limit || 20);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].status === STATUS_FAILED) {
        out.push({
          syncId: rows[i].sync_id,
          syncType: rows[i].sync_type,
          entityType: rows[i].entity_type,
          entityId: rows[i].entity_id,
          status: rows[i].status,
          errorCode: rows[i].error_code,
          detail: rows[i].detail,
          syncedAt: rows[i].synced_at
        });
      }
    }
    return out;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    STATUS_OK: STATUS_OK,
    STATUS_FAILED: STATUS_FAILED,
    STATUS_SKIPPED: STATUS_SKIPPED,
    TYPE_CALENDAR: TYPE_CALENDAR,
    TYPE_BACKUP: TYPE_BACKUP,
    TYPE_EMAIL: TYPE_EMAIL,
    record: record,
    listRecent: listRecent,
    countByStatus: countByStatus,
    recentFailures: recentFailures
  };
})();