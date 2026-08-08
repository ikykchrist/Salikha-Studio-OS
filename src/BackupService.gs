/**
 * BackupService.gs
 * Layered backup for the Salikha workbook (docs/BACKUP_RECOVERY.md).
 *
 * Strategy:
 * - Daily: full workbook copy into Backups/Daily (DriveApp makeCopy).
 * - Weekly: mirror the latest daily backup to the off-site folder
 *   (OFF_SITE_BACKUP_FOLDER_ID, optional - SKIPPED when unset).
 * - CSV per sheet: every approved sheet exported as CSV to Backups/CSV.
 * - Verification: backup folders contain workbook copies + CSV exports;
 *   outcome recorded in SyncLogs.
 * - Retention: keeps KEEP_DAILY newest daily backups, trashes the rest.
 *
 * Safety:
 * - Restore drills (restoreDrill) are restricted to test workbooks; the
 *   live spreadsheet is never the restore target.
 * - Outcomes are audited (BACKUP_*) and recorded in SyncLogs.
 */

var BackupService = (function () {
  'use strict';

  var BACKUP_FOLDER_ID_KEY = 'BACKUP_FOLDER_ID';
  var OFF_SITE_FOLDER_ID_KEY = 'OFF_SITE_BACKUP_FOLDER_ID';

  var BACKUP_ROOT_NAME = 'Backups';
  var FOLDER_DAILY = 'Daily';
  var FOLDER_CSV = 'CSV';

  var KEEP_DAILY = 7;

  var META_LAST_BACKUP_AT = 'LAST_BACKUP_AT';
  var META_LAST_BACKUP_ID = 'LAST_BACKUP_ID';

  var KIND_DAILY = 'DAILY';
  var KIND_WEEKLY = 'WEEKLY';

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

  function getRoot() {
    var appRoot = DriveFolderService.getAppRootFolder();
    var iterator = appRoot.getFolders();
    while (iterator.hasNext()) {
      var candidate = iterator.next();
      if (candidate.getName() === BACKUP_ROOT_NAME) {
        return candidate;
      }
    }
    var created = appRoot.createFolder(BACKUP_ROOT_NAME);
    if (!created) {
      throw ErrorService.create(
        ErrorService.CODES.BACKUP_FOLDER_NOT_FOUND,
        'The backup folder could not be created.',
        null,
        ErrorService.CATEGORY_INTEGRATION
      );
    }
    return created;
  }

  function getBackupFolder(kind) {
    var root = getRoot();
    var name = kind === KIND_WEEKLY ? 'Weekly' : FOLDER_DAILY;
    var iterator = root.getFolders();
    while (iterator.hasNext()) {
      var candidate = iterator.next();
      if (candidate.getName() === name) {
        return candidate;
      }
    }
    var created = root.createFolder(name);
    if (!created) {
      throw ErrorService.create(
        ErrorService.CODES.BACKUP_FOLDER_NOT_FOUND,
        'The backup folder could not be created: ' + name + '.',
        null,
        ErrorService.CATEGORY_INTEGRATION
      );
    }
    return created;
  }

  function getCsvFolder() {
    var root = getRoot();
    var iterator = root.getFolders();
    while (iterator.hasNext()) {
      var candidate = iterator.next();
      if (candidate.getName() === FOLDER_CSV) {
        return candidate;
      }
    }
    var created = root.createFolder(FOLDER_CSV);
    if (!created) {
      throw ErrorService.create(
        ErrorService.CODES.BACKUP_FOLDER_NOT_FOUND,
        'The CSV backup folder could not be created.',
        null,
        ErrorService.CATEGORY_INTEGRATION
      );
    }
    return created;
  }

  function buildFileName(kind) {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var base = spreadsheet.getName() || 'Salikha Studio OS';
    var stamp = DateService.toIsoDate(new Date());
    return base + ' [' + stamp + ']' + (kind === KIND_WEEKLY ? ' weekly' : '');
  }

  /**
   * Creates the daily (or weekly) full backup + CSV exports.
   * @param {string} kind DAILY | WEEKLY
   */
  function createBackup(kind) {
    assertDatabase();
    kind = String(kind || KIND_DAILY).toUpperCase();
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var timestampIso = DateService.nowIso();
    var spreadsheetId = String(spreadsheet.getId() || 'unknown');

    AuditService.info(AuditService.ACTIONS.BACKUP_STARTED, 'SPREADSHEET', spreadsheetId, 'Backup started (' + kind + ').');

    try {
      var driveFile = null;
      try {
        driveFile = DriveApp.getFileById(spreadsheetId);
      } catch (e) {
        driveFile = null;
      }
      if (!driveFile) {
        throw ErrorService.create(ErrorService.CODES.BACKUP_FAILED, 'The workbook file could not be opened.', null, ErrorService.CATEGORY_INTEGRATION);
      }
      var folder = getBackupFolder(kind);
      var fileName = buildFileName(kind);
      var copy = driveFile.makeCopy(fileName, folder);
      if (!copy || !copy.getId()) {
        throw ErrorService.create(ErrorService.CODES.BACKUP_FAILED, 'The backup copy could not be created.', null, ErrorService.CATEGORY_INTEGRATION);
      }

      var csvFiles = exportAllSheetsCsv();
      if (kind === KIND_DAILY) {
        setMetadata(META_LAST_BACKUP_AT, timestampIso);
        setMetadata(META_LAST_BACKUP_ID, copy.getId());
        pruneOldBackups();
      }

      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'SPREADSHEET',
        entityId: spreadsheetId,
        externalType: 'DRIVE',
        externalId: copy.getId(),
        status: SyncLogService.STATUS_OK,
        retryCount: 0,
        detail: kind + ' backup created: ' + fileName + ' (' + csvFiles + ' CSV exports).'
      });
      AuditService.info(AuditService.ACTIONS.BACKUP_COMPLETED, 'SPREADSHEET', spreadsheetId, 'Backup completed (' + kind + ').', { fileId: copy.getId(), csvFiles: csvFiles });

      return { ok: true, kind: kind, fileId: copy.getId(), fileName: fileName, csvFiles: csvFiles, timestampIso: timestampIso };
    } catch (err) {
      var safe = ErrorService.normalize(err);
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'SPREADSHEET',
        entityId: spreadsheetId,
        status: SyncLogService.STATUS_FAILED,
        errorCode: safe.code || ErrorService.CODES.BACKUP_FAILED,
        retryCount: 1,
        detail: (safe.message || 'Backup failed.').slice(0, 300)
      });
      AuditService.warn(AuditService.ACTIONS.BACKUP_FAILED, 'SPREADSHEET', spreadsheetId, 'Backup failed: ' + (safe.message || ''));
      return { ok: false, kind: kind, errorCode: safe.code || ErrorService.CODES.BACKUP_FAILED };
    }
  }

  /**
   * Mirrors the latest daily backup to the off-site folder.
   */
  function mirrorToOffSite() {
    var offSiteId = Config.get(OFF_SITE_FOLDER_ID_KEY);
    if (!offSiteId) {
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'OFF_SITE',
        entityId: '',
        status: SyncLogService.STATUS_SKIPPED,
        detail: 'OFF_SITE_BACKUP_FOLDER_ID is not configured; weekly mirror skipped.'
      });
      return { mirrored: false, reason: 'OFF_SITE_BACKUP_FOLDER_ID not configured' };
    }
    var lastBackupId = getMetadata(META_LAST_BACKUP_ID);
    if (!lastBackupId) {
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'OFF_SITE',
        entityId: '',
        status: SyncLogService.STATUS_SKIPPED,
        detail: 'No daily backup exists to mirror.'
      });
      return { mirrored: false, reason: 'No daily backup yet' };
    }
    try {
      var source = DriveApp.getFileById(lastBackupId);
      var targetFolder = DriveApp.getFolderById(offSiteId);
      if (!source || !targetFolder) {
        throw ErrorService.create(ErrorService.CODES.BACKUP_FOLDER_NOT_FOUND, 'The backup source or off-site folder is not reachable.', null, ErrorService.CATEGORY_INTEGRATION);
      }
      var copy = source.makeCopy(source.getName() + ' offsite', targetFolder);
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'OFF_SITE',
        entityId: 'off-site',
        externalType: 'DRIVE',
        externalId: copy.getId(),
        status: SyncLogService.STATUS_OK,
        retryCount: 0,
        detail: 'Off-site mirror created: ' + copy.getName()
      });
      return { mirrored: true, fileId: copy.getId(), name: copy.getName() };
    } catch (err) {
      var safe = ErrorService.normalize(err);
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'OFF_SITE',
        entityId: '',
        status: SyncLogService.STATUS_FAILED,
        errorCode: safe.code || ErrorService.CODES.BACKUP_FAILED,
        detail: (safe.message || 'Off-site mirror failed.').slice(0, 300)
      });
      return { mirrored: false, errorCode: safe.code };
    }
  }

  /**
   * Exports every approved sheet to CSV into the CSV folder.
   * @return {number} files created
   */
  function exportAllSheetsCsv() {
    var csvFolder = getCsvFolder();
    var stamp = DateService.toIsoDate(new Date());
    var count = 0;
    var approved = SheetSchemaService.APPROVED_SHEETS;
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    for (var i = 0; i < approved.length; i++) {
      var sheet = spreadsheet.getSheetByName(approved[i]);
      if (!sheet) {
        continue;
      }
      try {
        var values = sheet.getDataRange().getValues();
        var csv = buildCsv(values);
        var file = csvFolder.createFile(approved[i] + '-' + stamp + '.csv', csv, 'text/csv');
        if (file && file.getId()) {
          count++;
        }
      } catch (err) {
        SyncLogService.record({
          syncType: SyncLogService.TYPE_BACKUP,
          entityType: 'SHEET',
          entityId: approved[i],
          externalType: 'DRIVE',
          status: SyncLogService.STATUS_FAILED,
          errorCode: ErrorService.CODES.BACKUP_FAILED,
          detail: 'CSV export failed for sheet ' + approved[i] + '.'
        });
      }
    }
    return count;
  }

  function buildCsv(values) {
    var lines = [];
    for (var r = 0; r < values.length; r++) {
      var cells = [];
      for (var c = 0; c < values[r].length; c++) {
        var v = values[r][c];
        if (v === undefined || v === null) {
          cells.push('');
          continue;
        }
        if (v instanceof Date) {
          cells.push(DateService.toIsoDate(v));
          continue;
        }
        if (typeof v === 'boolean') {
          cells.push(v ? 'TRUE' : 'FALSE');
          continue;
        }
        var s = String(v);
        if (/^[=+\-@]/.test(s)) {
          s = "'" + s; // neutralize formula-looking user text
        }
        if (/[",\r\n]/.test(s)) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        cells.push(s);
      }
      lines.push(cells.join(','));
    }
    return lines.join('\r\n');
  }

  /**
   * Verification pass: every backup subfolder has at least one workbook
   * copy and the CSV folder has at least one export. Outcome in SyncLogs.
   */
  function verifyBackups() {
    var result = { folders: [], csvCount: 0, ok: true };
    if (!DatabaseService.isInitialized()) {
      return result;
    }
    try {
      var root = getRoot();
      var iterator = root.getFolders();
      var names = [];
      while (iterator.hasNext()) {
        names.push(iterator.next().getName());
      }
      for (var i = 0; i < names.length; i++) {
        var folder = getBackupFolder(names[i] === 'Weekly' ? KIND_WEEKLY : KIND_DAILY);
        var fileIterator = folder.getFiles();
        var count = 0;
        while (fileIterator.hasNext()) {
          fileIterator.next();
          count++;
        }
        result.folders.push({ folder: names[i], count: count });
        if (count === 0) {
          result.ok = false;
        }
      }
      var csvFolder = getCsvFolder();
      var csvIterator = csvFolder.getFiles();
      while (csvIterator.hasNext()) {
        csvIterator.next();
        result.csvCount++;
      }
      if (result.csvCount === 0) {
        result.ok = false;
      }
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'SPREADSHEET',
        entityId: String(SpreadsheetApp.getActiveSpreadsheet().getId() || 'unknown'),
        status: result.ok ? SyncLogService.STATUS_OK : SyncLogService.STATUS_FAILED,
        errorCode: result.ok ? '' : ErrorService.CODES.BACKUP_VERIFICATION_FAILED,
        retryCount: 0,
        detail: 'Verification checked ' + result.folders.length + ' folder(s) and ' + result.csvCount + ' CSV export(s).'
      });
      return result;
    } catch (err) {
      var safe = ErrorService.normalize(err);
      result.ok = false;
      SyncLogService.record({
        syncType: SyncLogService.TYPE_BACKUP,
        entityType: 'SPREADSHEET',
        entityId: String(SpreadsheetApp.getActiveSpreadsheet().getId() || 'unknown'),
        status: SyncLogService.STATUS_FAILED,
        errorCode: safe.code || ErrorService.CODES.BACKUP_VERIFICATION_FAILED,
        detail: (safe.message || 'Backup verification failed.').slice(0, 300)
      });
      return result;
    }
  }

  /**
   * Keeps the newest KEEP_DAILY backups; trashes the rest.
   */
  function pruneOldBackups() {
    var folder = getBackupFolder(KIND_DAILY);
    var files = [];
    var iterator = folder.getFiles();
    while (iterator.hasNext()) {
      files.push(iterator.next());
    }
    files.sort(function (a, b) {
      return String(a.getName()).localeCompare(String(b.getName()));
    });
    var removed = 0;
    while (files.length > KEEP_DAILY) {
      var oldest = files.shift();
      oldest.setTrashed(true);
      removed++;
    }
    return removed;
  }

  function setMetadata(key, value) {
    var existing = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, key);
    var now = DateService.nowIso();
    if (existing) {
      RepositoryService.updateById(SheetSchemaService.SHEET_SYSTEM_METADATA, key, {
        metadata_value: String(value),
        updated_at: now,
        updated_by: 'automation'
      });
    } else {
      RepositoryService.appendRecord(SheetSchemaService.SHEET_SYSTEM_METADATA, {
        metadata_key: key,
        metadata_value: String(value),
        description: 'Backup automation bookkeeping.',
        updated_at: now,
        updated_by: 'automation'
      });
    }
  }

  function getMetadata(key) {
    var existing = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, key);
    return existing ? existing.metadata_value : '';
  }

  /**
   * Readiness probe for the backup folder tree (Drive-only; idempotent).
   * Creates the backup root and subfolders when missing, never deletes.
   * Does not depend on SpreadsheetApp so it is safe inside a web app
   * request (used by the setup orchestrator, full run only).
   * @return {{ok: boolean, rootName: string}}
   */
  function ensureBackupStructure() {
    var root = getRoot();
    getBackupFolder(KIND_DAILY);
    getBackupFolder(KIND_WEEKLY);
    getCsvFolder();
    return { ok: true, rootName: String(root.getName() || 'backups') };
  }

  function lastBackupInfo() {
    return {
      lastBackupAt: getMetadata(META_LAST_BACKUP_AT),
      lastBackupId: getMetadata(META_LAST_BACKUP_ID)
    };
  }

  /**
   * Restore drill: copies a backup next to a TEST workbook. The live
   * workbook is never the target (BACKUP_RESTORE_REQUIRES_TEST).
   */
  function restoreDrill(testSpreadsheetId, backupId) {
    var liveId = String(SpreadsheetApp.getActiveSpreadsheet().getId() || '').toLowerCase();
    var testId = String(testSpreadsheetId || '').toLowerCase();
    if (testId.indexOf('test') === -1) {
      throw ErrorService.create(
        ErrorService.CODES.BACKUP_RESTORE_REQUIRES_TEST,
        'Restore drills may only target test workbooks.',
        null,
        ErrorService.CATEGORY_SECURITY
      );
    }
    if (liveId !== testId) {
      throw ErrorService.create(
        ErrorService.CODES.BACKUP_RESTORE_REQUIRES_TEST,
        'The active workbook must be the test workbook during a drill.',
        null,
        ErrorService.CATEGORY_SECURITY
      );
    }
    var backup = DriveApp.getFileById(backupId);
    var testFile = DriveApp.getFileById(testSpreadsheetId);
    if (!backup || !testFile) {
      throw ErrorService.create(ErrorService.CODES.BACKUP_FAILED, 'The backup or test workbook could not be opened.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var folder = testFile.getParents().next();
    var restored = backup.makeCopy('RESTORED-' + testFile.getName(), folder);
    SyncLogService.record({
      syncType: SyncLogService.TYPE_BACKUP,
      entityType: 'TEST_RESTORE',
      entityId: testSpreadsheetId,
      externalType: 'DRIVE',
      externalId: restored.getId(),
      status: SyncLogService.STATUS_OK,
      retryCount: 0,
      detail: 'Restore drill completed on the test workbook.'
    });
    AuditService.info(AuditService.ACTIONS.BACKUP_RESTORE_TEST, 'SPREADSHEET', testSpreadsheetId, 'Restore drill executed against the test workbook.', { restoredId: restored.getId() });
    return { ok: true, restoredId: restored.getId(), name: restored.getName() };
  }

  return {
    BACKUP_FOLDER_ID_KEY: BACKUP_FOLDER_ID_KEY,
    OFF_SITE_FOLDER_ID_KEY: OFF_SITE_FOLDER_ID_KEY,
    KIND_DAILY: KIND_DAILY,
    KIND_WEEKLY: KIND_WEEKLY,
    createBackup: createBackup,
    mirrorToOffSite: mirrorToOffSite,
    verifyBackups: verifyBackups,
    ensureBackupStructure: ensureBackupStructure,
    lastBackupInfo: lastBackupInfo,
    restoreDrill: restoreDrill
  };
})();