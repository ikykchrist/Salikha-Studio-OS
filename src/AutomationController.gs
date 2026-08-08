/**
 * AutomationController.gs
 * Server entry points for automation management (Sprint 8):
 *   - trigger installation/removal/status
 *   - manual runs (backup, calendar sync, digest) for the UI
 *   - digest recipient configuration
 *   - timer handler functions invoked by AutomationTriggerService
 *
 * Timer handlers never throw: failures are recorded in SyncLogs and
 * audited with the matching FAILED action.
 */

function getAutomationStatus() {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var triggerStatus = AutomationTriggerService.getStatus();
    var lastBackup = BackupService.lastBackupInfo();
    var config = {
      calendarConfigured: CalendarService.isConfigured(),
      driveStatus: DriveFolderService.getDriveStatus(),
      backupFolderConfigured: Config.hasProperty(BackupService.BACKUP_FOLDER_ID_KEY),
      offsiteConfigured: Config.hasProperty(BackupService.OFF_SITE_FOLDER_ID_KEY)
    };
    return ResponseService.success({
      triggerStatus: triggerStatus,
      lastBackup: lastBackup,
      config: config
    }, 'Automation status retrieved.');
  })();
}

function setupAutomationTriggers() {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var installed = AutomationTriggerService.installTriggers();
    AuditService.info(AuditService.ACTIONS.AUTOMATION_TRIGGERS_SETUP, 'Automation', 'triggers',
      'Automation triggers installed (' + installed.length + ').', { handlers: installed.map(function (t) { return t.handler; }) });
    return ResponseService.success(installed, 'Automation triggers installed.');
  })();
}

function removeAutomationTriggers() {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var removed = AutomationTriggerService.uninstallTriggers();
    AuditService.info(AuditService.ACTIONS.AUTOMATION_TRIGGERS_REMOVED, 'Automation', 'triggers',
      'Automation triggers removed (' + removed + ').', { removed: removed });
    return ResponseService.success({ removed: removed }, 'Automation triggers removed.');
  })();
}

function runBackupNow() {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var result = runJob('backup.manual', function () {
      return BackupService.createBackup(BackupService.KIND_DAILY);
    });
    if (result && result.ok === false) {
      return ResponseService.failure(ErrorService.create(
        result.errorCode || ErrorService.CODES.BACKUP_FAILED,
        result.message || 'Backup failed.',
        null,
        ErrorService.CATEGORY_INTEGRATION
      ));
    }
    return ResponseService.success(result, 'Backup executed.');
  })();
}

function runCalendarSyncNow() {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var result = CalendarSyncService.syncAllEligible();
    return ResponseService.success(result, 'Calendar sync ran.');
  })();
}

function runDigestNow(payload) {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var testRecipient = payload && payload.testRecipient ? String(payload.testRecipient).trim() : null;
    var result = DigestService.sendDigest(testRecipient ? { testRecipient: testRecipient } : null);
    return ResponseService.success(result, 'Digest sent.');
  })();
}

function setDigestRecipients(payload) {
  return ErrorService.wrap(function () {
    AutomationPermissionService.requireManageAccess();
    var actor = AutomationPermissionService.getActor();
    var raw = payload && payload.recipients ? String(payload.recipients) : '';
    var list = raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    if (list.length === 0) {
      throw ErrorService.create(ErrorService.CODES.DIGEST_RECIPIENT_INVALID,
        'At least one recipient is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    for (var i = 0; i < list.length; i++) {
      if (!ValidationService.isEmail(list[i], 'recipient').valid) {
        throw ErrorService.create(ErrorService.CODES.DIGEST_RECIPIENT_INVALID,
          'Invalid recipient email: ' + list[i], null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    var value = list.join(',');
    var existing = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, DigestService.META_RECIPIENTS);
    if (existing) {
      RepositoryService.updateById(SheetSchemaService.SHEET_SYSTEM_METADATA, DigestService.META_RECIPIENTS, {
        metadata_value: value,
        updated_at: DateService.nowIso(),
        updated_by: actor.userId
      });
    } else {
      RepositoryService.appendRecord(SheetSchemaService.SHEET_SYSTEM_METADATA, {
        metadata_key: DigestService.META_RECIPIENTS,
        metadata_value: value,
        description: 'Weekly digest recipient list (comma-separated emails).',
        updated_at: DateService.nowIso(),
        updated_by: actor.userId
      });
    }
    AuditService.info(AuditService.ACTIONS.AUTOMATION_SETTINGS_CHANGED, 'SystemMetadata', DigestService.META_RECIPIENTS,
      'Digest recipients updated.', { recipients: value });
    return ResponseService.success({ recipients: value }, 'Digest recipients saved.');
  })();
}

/* ---------------- Timer handler functions ---------------- */

function automationDailyBackup() {
  return runJob('backup.daily', function () {
    return BackupService.createBackup(BackupService.KIND_DAILY);
  });
}

function automationWeeklyOffsite() {
  return runJob('backup.weekly', function () {
    return BackupService.createBackup(BackupService.KIND_WEEKLY);
  });
}

function automationBackupVerification() {
  return runJob('backup.verification', function () {
    return BackupService.verifyBackups();
  });
}

function automationWeeklyDigest() {
  return runJob('email.digest', function () {
    return DigestService.sendDigest(null);
  });
}

/* ---------------- job runner (shared, non-throwing) ---------------- */

function runJob(jobKey, fn) {
  try {
    if (!DatabaseService.isInitialized()) {
      return { skipped: true, reason: 'Database not initialized' };
    }
    var isDigestJob = String(jobKey).indexOf('digest') !== -1;
    var result = fn();
    AuditService.info(
      result && result.errorCode
        ? (isDigestJob ? AuditService.ACTIONS.DIGEST_FAILED : AuditService.ACTIONS.BACKUP_FAILED)
        : (isDigestJob ? AuditService.ACTIONS.DIGEST_SENT : AuditService.ACTIONS.BACKUP_COMPLETED),
      'Automation', jobKey, 'Automation job completed: ' + jobKey + '.');
    return result;
  } catch (err) {
    var safe = ErrorService.normalize(err);
    var isDigestFailed = String(jobKey).indexOf('digest') !== -1;
    var summary = 'Automation job failed: ' + jobKey + (safe.message ? ' - ' + safe.message : '');
    AuditService.warn(isDigestFailed ? AuditService.ACTIONS.DIGEST_FAILED : AuditService.ACTIONS.BACKUP_FAILED,
      'Automation', jobKey, summary);
    SyncLogService.record({
      syncType: isDigestFailed ? SyncLogService.TYPE_EMAIL : SyncLogService.TYPE_BACKUP,
      entityType: 'AUTOMATION',
      entityId: jobKey,
      status: SyncLogService.STATUS_FAILED,
      errorCode: safe.code || ErrorService.CODES.BACKUP_FAILED,
      detail: summary
    });
    return { ok: false, errorCode: safe.code || ErrorService.CODES.BACKUP_FAILED };
  }
}