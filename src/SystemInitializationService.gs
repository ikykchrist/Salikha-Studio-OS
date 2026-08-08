/**
 * SystemInitializationService.gs
 * First-run initialization orchestrator for Salikha Studio OS.
 *
 * Runs the complete infrastructure steps idempotently: Google account,
 * authorization, business database, database schema, Google Drive,
 * business calendar, automation triggers, backup folder, security
 * snapshot, and system health. Persists a SYSTEM_INITIALIZED marker in
 * Script Properties only after every step succeeds. Never exposes
 * resource IDs, never destroys data, and never creates business
 * records.
 *
 * Step failures carry controlled error codes (ErrorService): the
 * documented setup set (DATABASE_NOT_CONFIGURED, DRIVE_NOT_CONFIGURED,
 * CALENDAR_NOT_CONFIGURED, AUTHORIZATION_REQUIRED, USER_NOT_REGISTERED,
 * SETUP_PERMISSION_DENIED, AUTOMATION_SETUP_FAILED,
 * SYSTEM_HEALTH_FAILED) plus more specific infrastructure codes where
 * helpful. The status payload shape is the contract consumed by the
 * first-run landing page (setup-page.html / setup-scripts.html).
 */

var SystemInitializationService = (function () {
  'use strict';

  var SETUP_VERSION = '1';

  /* Script Properties keys (infrastructure state; never sent to UI) */
  var PROP_INITIALIZED = 'SYSTEM_INITIALIZED';
  var PROP_INITIALIZED_AT = 'SYSTEM_INITIALIZED_AT';
  var PROP_INITIALIZED_BY = 'SYSTEM_INITIALIZED_BY';
  var PROP_SETUP_VERSION = 'SYSTEM_SETUP_VERSION';

  /* Overall setup statuses */
  var STATUS_NOT_READY = 'NOT_READY';
  var STATUS_READY = 'READY';
  var STATUS_NEEDS_ATTENTION = 'NEEDS_ATTENTION';

  /* Per-step statuses */
  var STEP_SUCCESS = 'SUCCESS';
  var STEP_WARNING = 'WARNING';
  var STEP_FAILED = 'FAILED';

  /* Step keys */
  var STEP_ACCOUNT = 'account';
  var STEP_AUTHORIZATION = 'authorization';
  var STEP_DATABASE = 'database';
  var STEP_SCHEMA = 'schema';
  var STEP_DRIVE = 'drive';
  var STEP_CALENDAR = 'calendar';
  var STEP_AUTOMATION = 'automation';
  var STEP_BACKUP = 'backup';
  var STEP_SECURITY = 'security';
  var STEP_HEALTH = 'health';

  var STEP_DEFS = [
    { key: STEP_ACCOUNT, label: 'Google account' },
    { key: STEP_AUTHORIZATION, label: 'Authorization' },
    { key: STEP_DATABASE, label: 'Business database' },
    { key: STEP_SCHEMA, label: 'Database schema' },
    { key: STEP_DRIVE, label: 'Google Drive' },
    { key: STEP_CALENDAR, label: 'Business calendar' },
    { key: STEP_AUTOMATION, label: 'Automation' },
    { key: STEP_BACKUP, label: 'Backups' },
    { key: STEP_SECURITY, label: 'Security check' },
    { key: STEP_HEALTH, label: 'System health' }
  ];

  function getPropertyStore() {
    return PropertiesService.getScriptProperties();
  }

  function readMeta(key) {
    var value = getPropertyStore().getProperty(key);
    return value === null || value === undefined ? null : String(value);
  }

  function writeMeta(key, value) {
    getPropertyStore().setProperty(key, String(value));
  }

  function isMarkedInitialized() {
    if (readMeta(PROP_SETUP_VERSION) !== SETUP_VERSION) {
      return false;
    }
    return readMeta(PROP_INITIALIZED) === 'true';
  }

  /**
   * The signed-in user's email, or null when anonymous.
   */
  function resolveSessionEmail() {
    try {
      var user = Session.getActiveUser();
      if (!user || typeof user.getEmail !== 'function') {
        return null;
      }
      var email = String(user.getEmail() || '').trim();
      return email === '' ? null : email;
    } catch (ignored) {
      return null;
    }
  }

  function labelFor(key) {
    for (var i = 0; i < STEP_DEFS.length; i++) {
      if (STEP_DEFS[i].key === key) {
        return STEP_DEFS[i].label;
      }
    }
    return key;
  }

  function okStep(key, opts) {
    var step = {
      key: key,
      label: labelFor(key),
      status: opts && opts.status === STEP_WARNING ? STEP_WARNING : STEP_SUCCESS,
      error: null
    };
    if (opts && opts.detail) {
      step.detail = opts.detail;
    }
    return step;
  }

  function failStep(key, code, fallbackMessage) {
    return {
      key: key,
      label: labelFor(key),
      status: STEP_FAILED,
      error: {
        code: code,
        message: stepMessage(code, fallbackMessage)
      }
    };
  }

  /**
   * User-friendly message for a step error code. A custom fallback wins
   * when provided; otherwise ErrorService maps the code.
   */
  function stepMessage(code, fallback) {
    if (fallback) {
      return fallback;
    }
    return ErrorService.toUserMessage(
      ErrorService.create(code, code, null, ErrorService.CATEGORY_INTERNAL)
    );
  }

  /* ------------------------------------------------------------------ */
  /* Steps                                                               */
  /* ------------------------------------------------------------------ */

  function accountStep() {
    var email = resolveSessionEmail();
    if (!email) {
      return failStep(STEP_ACCOUNT, 'AUTHORIZATION_REQUIRED');
    }
    return okStep(STEP_ACCOUNT, { detail: 'Signed in as ' + email });
  }

  function authorizationStep(actor) {
    try {
      SetupPermissionService.requireSetupAccess(actor);
      return okStep(STEP_AUTHORIZATION);
    } catch (err) {
      var code = ErrorService.normalize(err).code || 'SETUP_PERMISSION_DENIED';
      return failStep(STEP_AUTHORIZATION, code, stepMessage(code));
    }
  }

  function databaseStep(full) {
    if (!Config.hasProperty('SPREADSHEET_ID')) {
      return failStep(STEP_DATABASE, 'DATABASE_NOT_CONFIGURED');
    }
    if (!full) {
      return okStep(STEP_DATABASE);
    }
    try {
      var spreadsheet = SpreadsheetApp.openById(Config.getSpreadsheetId_());
      if (!spreadsheet) {
        return failStep(STEP_DATABASE, 'SPREADSHEET_NOT_FOUND');
      }
      var name = String(spreadsheet.getName ? spreadsheet.getName() : '').trim();
      return okStep(STEP_DATABASE, { detail: name || 'business database' });
    } catch (err) {
      var message = String(err && err.message ? err.message : '').toLowerCase();
      if (message.indexOf('permission') !== -1 || message.indexOf('access') !== -1) {
        return failStep(STEP_DATABASE, 'SPREADSHEET_ACCESS_DENIED');
      }
      if (message.indexOf('not exist') !== -1 || message.indexOf('not found') !== -1 || message.indexOf('cannot find') !== -1) {
        return failStep(STEP_DATABASE, 'SPREADSHEET_NOT_FOUND');
      }
      return failStep(STEP_DATABASE, 'DATABASE_NOT_CONFIGURED', 'The business database could not be opened. Check SPREADSHEET_ID in Script Properties.');
    }
  }

  function schemaStep(full) {
    if (DatabaseService.isInitialized()) {
      return okStep(STEP_SCHEMA);
    }
    if (!full) {
      return okStep(STEP_SCHEMA, { status: STEP_WARNING, detail: 'Pending initialization' });
    }
    try {
      DatabaseService.initializeDatabase();
      if (!DatabaseService.isInitialized()) {
        return failStep(STEP_SCHEMA, 'DATABASE_INITIALIZATION_FAILED');
      }
      return okStep(STEP_SCHEMA);
    } catch (err) {
      var code = ErrorService.normalize(err).code || 'DATABASE_INITIALIZATION_FAILED';
      return failStep(STEP_SCHEMA, 'DATABASE_INITIALIZATION_FAILED', stepMessage(code));
    }
  }

  function driveStep(full) {
    if (!Config.hasProperty('ROOT_DRIVE_FOLDER_ID')) {
      return failStep(STEP_DRIVE, 'DRIVE_NOT_CONFIGURED');
    }
    if (!full) {
      return okStep(STEP_DRIVE);
    }
    try {
      var folder = DriveApp.getFolderById(Config.getRootDriveFolderId_());
      if (!folder) {
        return failStep(STEP_DRIVE, 'DRIVE_FOLDER_NOT_FOUND');
      }
      if (typeof folder.isTrashed === 'function' && folder.isTrashed()) {
        return failStep(STEP_DRIVE, 'DRIVE_FOLDER_NOT_FOUND', 'The root Drive folder is in Trash. Restore it or update ROOT_DRIVE_FOLDER_ID.');
      }
      var name = String(folder.getName ? folder.getName() : '').trim();
      return okStep(STEP_DRIVE, { detail: name || 'root Drive folder' });
    } catch (err) {
      var message = String(err && err.message ? err.message : '').toLowerCase();
      if (message.indexOf('permission') !== -1 || message.indexOf('access') !== -1) {
        return failStep(STEP_DRIVE, 'DRIVE_FOLDER_ACCESS_DENIED');
      }
      return failStep(STEP_DRIVE, 'DRIVE_FOLDER_NOT_FOUND');
    }
  }

  function calendarStep(full) {
    if (!Config.hasProperty('CALENDAR_ID')) {
      return failStep(STEP_CALENDAR, 'CALENDAR_NOT_CONFIGURED');
    }
    if (!full) {
      return okStep(STEP_CALENDAR);
    }
    try {
      var calendar = CalendarApp.getCalendarById(Config.getCalendarId_());
      if (!calendar) {
        return failStep(STEP_CALENDAR, 'CALENDAR_NOT_FOUND');
      }
      var timezone = '';
      try {
        timezone = String(calendar.getTimeZone ? calendar.getTimeZone() : '');
      } catch (ignored) {
        timezone = '';
      }
      var businessTz = Config.getBusinessTimezone_();
      if (timezone && timezone !== businessTz) {
        return okStep(STEP_CALENDAR, {
          status: STEP_WARNING,
          detail: 'Calendar timezone is ' + timezone + '; the business timezone is ' + businessTz + '.'
        });
      }
      return okStep(STEP_CALENDAR);
    } catch (err) {
      var message = String(err && err.message ? err.message : '').toLowerCase();
      if (message.indexOf('permission') !== -1 || message.indexOf('access') !== -1) {
        return failStep(STEP_CALENDAR, 'CALENDAR_ACCESS_DENIED');
      }
      return failStep(STEP_CALENDAR, 'CALENDAR_NOT_FOUND');
    }
  }

  function automationStep(full) {
    var expected = AutomationTriggerService.TRIGGER_DEFS.length;
    if (!full) {
      var status = AutomationTriggerService.getStatus();
      var active = status && status.triggers ? status.triggers.length : 0;
      if (active >= expected) {
        return okStep(STEP_AUTOMATION);
      }
      return okStep(STEP_AUTOMATION, { status: STEP_WARNING, detail: 'Triggers pending installation' });
    }
    try {
      AutomationTriggerService.installTriggers();
      var after = AutomationTriggerService.getStatus();
      if (!after || !after.triggers || after.triggers.length < expected) {
        return failStep(STEP_AUTOMATION, 'AUTOMATION_SETUP_FAILED');
      }
      return okStep(STEP_AUTOMATION);
    } catch (err) {
      return failStep(STEP_AUTOMATION, 'AUTOMATION_SETUP_FAILED');
    }
  }

  function backupStep(full) {
    if (!full) {
      if (Config.hasProperty('BACKUP_FOLDER_ID')) {
        return okStep(STEP_BACKUP, { detail: 'Backup folder configured' });
      }
      return okStep(STEP_BACKUP, { status: STEP_WARNING, detail: 'Backup folder pending configuration' });
    }
    try {
      var structure = BackupService.ensureBackupStructure();
      return okStep(STEP_BACKUP, { detail: (structure && structure.rootName) || 'backup folders ready' });
    } catch (err) {
      var code = ErrorService.normalize(err).code || 'BACKUP_FAILED';
      return failStep(STEP_BACKUP, 'BACKUP_FAILED', stepMessage(code));
    }
  }

  function securityStep(actor, full) {
    try {
      var pub = Config.getPublicConfig();
      var pubJson = JSON.stringify(pub);
      if (Config.hasProperty('SPREADSHEET_ID')) {
        if (pubJson.indexOf(Config.getSpreadsheetId_()) !== -1) {
          return failStep(STEP_SECURITY, 'SYSTEM_HEALTH_FAILED', 'The spreadsheet ID was exposed publicly. Contact the owner.');
        }
      }
      if (Config.hasProperty('ROOT_DRIVE_FOLDER_ID')) {
        if (pubJson.indexOf(Config.getRootDriveFolderId_()) !== -1) {
          return failStep(STEP_SECURITY, 'SYSTEM_HEALTH_FAILED', 'The Drive folder ID was exposed publicly. Contact the owner.');
        }
      }
      if (Config.hasProperty('CALENDAR_ID')) {
        if (pubJson.indexOf(Config.getCalendarId_()) !== -1) {
          return failStep(STEP_SECURITY, 'SYSTEM_HEALTH_FAILED', 'The calendar ID was exposed publicly. Contact the owner.');
        }
      }
    } catch (ignored) {
      /* missing/placeholder properties throw; the individual steps report those */
    }
    if (full) {
      AuditService.info(
        AuditService.ACTIONS.SYSTEM_SETUP_SECURITY,
        'System',
        'security',
        'Security snapshot checked: no secrets in public configuration.',
        { metadata: { actor: actor.userId } }
      );
    }
    return okStep(STEP_SECURITY);
  }

  function healthStep() {
    try {
      var health = HealthService.getSystemHealth();
      if (!health || health.status !== 'ok') {
        return failStep(STEP_HEALTH, 'SYSTEM_HEALTH_FAILED');
      }
      var integrations = health.integrations || {};
      if (integrations.overall && integrations.overall !== 'CONNECTED' && integrations.overall !== 'PARTIALLY_CONFIGURED') {
        return failStep(STEP_HEALTH, 'SYSTEM_HEALTH_FAILED');
      }
      return okStep(STEP_HEALTH);
    } catch (err) {
      return failStep(STEP_HEALTH, 'SYSTEM_HEALTH_FAILED');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Orchestration                                                       */
  /* ------------------------------------------------------------------ */

  function runChecks(actor, full) {
    var results = [];
    results.push(accountStep());
    results.push(authorizationStep(actor));
    results.push(databaseStep(full));
    results.push(schemaStep(full));
    results.push(driveStep(full));
    results.push(calendarStep(full));
    results.push(automationStep(full));
    results.push(backupStep(full));
    results.push(securityStep(actor, full));
    results.push(healthStep());
    return results;
  }

  function auditStepResults(results, actor, outcome) {
    try {
      AuditService.info(
        AuditService.ACTIONS.SYSTEM_SETUP_STEP,
        'System',
        null,
        'Setup step results (' + outcome + '): ' + results.map(function (r) {
          return String(r.key) + '=' + String(r.status);
        }).join(', ') + '.',
        { metadata: { actor: actor.userId } }
      );
    } catch (ignored) {
      /* audit is additive and must never break setup */
    }
  }

  function overallFor(results, wasInitialized) {
    var failed = 0;
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === STEP_FAILED) {
        failed++;
      }
    }
    if (failed === 0) {
      return STATUS_READY;
    }
    return wasInitialized ? STATUS_NEEDS_ATTENTION : STATUS_NOT_READY;
  }

  function messageFor(overall, initialized) {
    if (overall === STATUS_READY) {
      return 'Salikha Studio OS is fully set up.';
    }
    if (overall === STATUS_NEEDS_ATTENTION) {
      return 'Salikha Studio OS needs attention. One or more checks are failing - run setup again to repair.';
    }
    if (initialized) {
      return 'Salikha Studio OS was initialized but is not completely ready. Run setup again.';
    }
    return 'Salikha Studio OS is not set up yet. Complete the setup to connect your business system.';
  }

  function userPayload(actor) {
    return {
      email: resolveSessionEmail() || String(actor.userId || ''),
      role: actor.role || null
    };
  }

  function buildPayload(results, initialized, wasInitialized, actor) {
    var overall = overallFor(results, wasInitialized);
    return {
      initialized: initialized,
      overallStatus: overall,
      setupVersion: SETUP_VERSION,
      steps: results,
      user: userPayload(actor),
      message: messageFor(overall, initialized)
    };
  }

  /**
   * Read-only setup status snapshot. Never mutates.
   * @param {Object} actor Optional request actor.
   * @return {Object} The setup payload (contract for the frontend).
   */
  function getSetupStatus(actor) {
    actor = actor || SetupPermissionService.getActor();
    var wasInitialized = isMarkedInitialized();
    var results = runChecks(actor, false);
    return buildPayload(results, wasInitialized, wasInitialized, actor);
  }

  /**
   * Full initialization run. Idempotent: healthy steps are skipped,
   * triggers are reinstalled by AutomationTriggerService semantics,
   * and backup folders are reused. Nothing is ever deleted.
   * @param {Object} [actor] Request context actor.
   * @return {Object} The setup payload.
   */
  function runInitialization(actor) {
    actor = actor || SetupPermissionService.getActor();
    var startedAt = DateService.nowIso();
    try {
      AuditService.info(
        AuditService.ACTIONS.SYSTEM_SETUP_STARTED,
        'System',
        null,
        'System initialization started by ' + String(actor.userId || 'unknown-user') + '.',
        { metadata: { actor: actor.userId } }
      );
    } catch (ignored) {
      /* audit is additive */
    }

    var results = runChecks(actor, true);
    var failedCount = 0;
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === STEP_FAILED) {
        failedCount++;
      }
    }
    var initialized = failedCount === 0;
    var wasInitialized = isMarkedInitialized();
    auditStepResults(results, actor, initialized ? 'COMPLETED' : 'INCOMPLETE');

    if (initialized) {
      var email = resolveSessionEmail() || String(actor.userId || 'unknown-user');
      writeMeta(PROP_INITIALIZED, 'true');
      writeMeta(PROP_INITIALIZED_AT, startedAt);
      writeMeta(PROP_INITIALIZED_BY, email);
      writeMeta(PROP_SETUP_VERSION, SETUP_VERSION);
      AuditService.info(
        AuditService.ACTIONS.SYSTEM_SETUP_COMPLETED,
        'System',
        null,
        'System initialized successfully (' + String(results.length) + ' steps OK).',
        { metadata: { actor: actor.userId } }
      );
      LoggerService.info('SystemInitializationService.runInitialization', 'Setup complete.', {
        steps: results.length,
        startedAt: startedAt
      });
    } else {
      AuditService.warn(
        AuditService.ACTIONS.SYSTEM_SETUP_FAILED,
        'System',
        null,
        'System initialization did not complete (' + String(failedCount) + ' step(s) failed).',
        { metadata: { actor: actor.userId } }
      );
      LoggerService.warn('SystemInitializationService.runInitialization', 'Setup incomplete.', {
        failedSteps: failedCount
      });
    }

    return buildPayload(results, initialized, wasInitialized, actor);
  }

  return {
    SETUP_VERSION: SETUP_VERSION,
    STATUS_NOT_READY: STATUS_NOT_READY,
    STATUS_READY: STATUS_READY,
    STATUS_NEEDS_ATTENTION: STATUS_NEEDS_ATTENTION,
    STEP_SUCCESS: STEP_SUCCESS,
    STEP_WARNING: STEP_WARNING,
    STEP_FAILED: STEP_FAILED,
    STEP_DEFS: STEP_DEFS.slice(0),
    isMarkedInitialized: isMarkedInitialized,
    getSetupStatus: getSetupStatus,
    runInitialization: runInitialization
  };
})();