/**
 * IntegrationService.gs
 * Spreadsheet, Drive, and Calendar integration verification.
 *
 * Every check is read-only and returns ONLY safe information:
 * configuration presence, accessibility, status, and resource NAME.
 * Resource IDs are never returned to the frontend and never logged.
 *
 * Each resource is verified independently; a failure in one never
 * stops the others.
 */

var IntegrationService = (function () {
  'use strict';

  var STATUS_NOT_CONFIGURED = 'NOT_CONFIGURED';
  var STATUS_CONNECTED = 'CONNECTED';
  var STATUS_CONNECTED_BUT_NOT_INITIALIZED = 'CONNECTED_BUT_NOT_INITIALIZED';
  var STATUS_NEEDS_INITIALIZATION = 'NEEDS_INITIALIZATION';
  var STATUS_NOT_FOUND = 'NOT_FOUND';
  var STATUS_ACCESS_DENIED = 'ACCESS_DENIED';
  var STATUS_ERROR = 'ERROR';

  var OVERALL_CONNECTED = 'CONNECTED';
  var OVERALL_PARTIALLY_CONFIGURED = 'PARTIALLY_CONFIGURED';
  var OVERALL_NOT_CONFIGURED = 'NOT_CONFIGURED';
  var OVERALL_CONNECTION_ERROR = 'CONNECTION_ERROR';

  function safeName(value) {
    var name = String(value || '').trim();
    return name.length > 80 ? name.substring(0, 80) : name;
  }

  function errorStatus(code, message) {
    return {
      configured: true,
      accessible: false,
      status: code,
      code: code,
      message: message
    };
  }

  function notConfigured(key, friendlyLabel) {
    return {
      configured: false,
      accessible: false,
      status: STATUS_NOT_CONFIGURED,
      code: key,
      message: friendlyLabel + ' is not configured. Add ' + key + ' in Apps Script Script Properties, then run Check Connections.'
    };
  }

  /**
   * Maps an exception to a safe NOT_FOUND / ACCESS_DENIED / ERROR status
   * without exposing the raw message.
   */
  function mapException(e, notFoundLabel, deniedLabel) {
    var text = String(e && e.message || '');
    if (/does not exist|not found|cannot find|invalid|deleted/i.test(text)) {
      return errorStatus('NOT_FOUND', notFoundLabel);
    }
    if (/permission|access|authoriz|403|insufficient|forbidden/i.test(text)) {
      return errorStatus('ACCESS_DENIED', deniedLabel);
    }
    return errorStatus('ERROR', 'The integration could not be verified. Please try again.');
  }

  /* ------------------------------------------------------------------ */
  /* Spreadsheet                                                         */
  /* ------------------------------------------------------------------ */

  function verifySpreadsheet() {
    var notConfiguredStatus = notConfigured('SPREADSHEET_ID', 'The business database spreadsheet');
    if (!Config.hasProperty('SPREADSHEET_ID')) {
      return notConfiguredStatus;
    }
    var spreadsheetId;
    try {
      spreadsheetId = Config.getSpreadsheetId_();
    } catch (e) {
      return notConfiguredStatus;
    }
    var spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      var mapped = mapException(e,
        'The business database could not be found. Confirm SPREADSHEET_ID in Apps Script Script Properties.',
        'The business database could not be accessed. Confirm that the executing Google account can edit the spreadsheet.');
      return mapped;
    }
    var name;
    try {
      name = safeName(spreadsheet.getName());
    } catch (e) {
      return mapException(e,
        'The business database could not be found.',
        'The business database could not be accessed. Confirm the executing account has access.');
    }

    var schemaCheck = checkSprint1Schema(spreadsheet);
    var result = {
      configured: true,
      accessible: true,
      resourceType: 'SPREADSHEET',
      resourceName: name,
      schemaReady: schemaCheck.schemaReady,
      sheetsPresent: schemaCheck.sheetsPresent,
      schemaVersion: schemaCheck.schemaVersion,
      status: schemaCheck.schemaReady ? STATUS_CONNECTED : STATUS_CONNECTED_BUT_NOT_INITIALIZED,
      message: schemaCheck.schemaReady
        ? 'The business database is connected and the Sprint 1 schema is ready.'
        : 'The business database is connected but the Sprint 1 schema is not initialized. Run database initialization.'
    };
    if (!schemaCheck.sheetsPresent) {
      result.status = STATUS_NEEDS_INITIALIZATION;
    }
    return result;
  }

  /**
   * Read-only Sprint 1 schema check. Never writes to the spreadsheet.
   */
  function checkSprint1Schema(spreadsheet) {
    var required = SheetSchemaService.SPRINT_1_SHEETS;
    var present = [];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
      var sheet = spreadsheet.getSheetByName(required[i]);
      if (sheet) {
        present.push(required[i]);
      } else {
        missing.push(required[i]);
      }
    }
    if (missing.length > 0) {
      return { schemaReady: false, sheetsPresent: false, missingSheets: missing, schemaVersion: null };
    }
    var headersValid = true;
    var mismatch = [];
    for (var p = 0; p < present.length; p++) {
      var sheet = spreadsheet.getSheetByName(present[p]);
      var expected = SheetSchemaService.getHeaders(present[p]);
      var actual = [];
      try {
        actual = RepositoryService.readHeaders(sheet);
      } catch (e) {
        headersValid = false;
        mismatch.push(present[p]);
        continue;
      }
      if (actual.length !== expected.length) {
        headersValid = false;
        mismatch.push(present[p]);
        continue;
      }
      for (var h = 0; h < expected.length; h++) {
        if (actual[h] !== expected[h]) {
          headersValid = false;
          mismatch.push(present[p]);
          break;
        }
      }
    }
    var schemaVersion = null;
    if (headersValid) {
      try {
        var versionRecord = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, 'database_schema_version');
        schemaVersion = versionRecord ? versionRecord.metadata_value : null;
      } catch (e) {
        schemaVersion = null;
      }
    }
    return {
      schemaReady: headersValid && schemaVersion === SheetSchemaService.SCHEMA_VERSION,
      sheetsPresent: true,
      headerMismatch: mismatch,
      schemaVersion: schemaVersion
    };
  }

  /* ------------------------------------------------------------------ */
  /* Drive                                                               */
  /* ------------------------------------------------------------------ */

  function verifyDriveFolder() {
    var notConfiguredStatus = notConfigured('ROOT_DRIVE_FOLDER_ID', 'The root Drive folder');
    if (!Config.hasProperty('ROOT_DRIVE_FOLDER_ID')) {
      return notConfiguredStatus;
    }
    var folderId;
    try {
      folderId = Config.getRootDriveFolderId_();
    } catch (e) {
      return notConfiguredStatus;
    }
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      return mapException(e,
        'The root Drive folder could not be found. Confirm ROOT_DRIVE_FOLDER_ID in Apps Script Script Properties.',
        'The root Drive folder could not be accessed. Confirm that the executing Google account can access the folder.');
    }
    var trashed = false;
    try {
      trashed = folder.isTrashed();
    } catch (ignored) {
      trashed = false;
    }
    if (trashed) {
      return errorStatus('NOT_FOUND', 'The root Drive folder is in Trash. Restore it or choose another folder.');
    }
    var name;
    try {
      name = safeName(folder.getName());
    } catch (e) {
      return errorStatus('ERROR', 'The root Drive folder could not be read. Please try again.');
    }
    return {
      configured: true,
      accessible: true,
      resourceType: 'DRIVE_FOLDER',
      resourceName: name,
      status: STATUS_CONNECTED,
      message: 'File storage is connected.'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Calendar                                                            */
  /* ------------------------------------------------------------------ */

  function verifyCalendar() {
    var notConfiguredStatus = notConfigured('CALENDAR_ID', 'The business calendar');
    if (!Config.hasProperty('CALENDAR_ID')) {
      return notConfiguredStatus;
    }
    var calendarId;
    try {
      calendarId = Config.getCalendarId_();
    } catch (e) {
      return notConfiguredStatus;
    }
    var calendar;
    try {
      calendar = CalendarApp.getCalendarById(calendarId);
    } catch (e) {
      return mapException(e,
        'The business calendar could not be found. Confirm CALENDAR_ID in Apps Script Script Properties.',
        'The business calendar could not be accessed. Confirm that the executing Google account has access.');
    }
    if (!calendar) {
      return errorStatus('NOT_FOUND',
        'The business calendar could not be accessed. Confirm CALENDAR_ID and that the executing account can see the calendar.');
    }
    var name;
    var timezone;
    try {
      name = safeName(calendar.getName());
      timezone = String(calendar.getTimeZone() || '');
    } catch (e) {
      return errorStatus('ERROR', 'The business calendar could not be read. Please try again.');
    }
    var businessTimezone = Config.getBusinessTimezone_();
    var timezoneReady = timezone === businessTimezone;
    return {
      configured: true,
      accessible: true,
      resourceType: 'CALENDAR',
      resourceName: name,
      timezone: timezone || '',
      timezoneReady: timezoneReady,
      status: STATUS_CONNECTED,
      message: timezoneReady
        ? 'The business calendar is connected.'
        : 'The business calendar is connected but its timezone differs from ' + businessTimezone + '. Consider changing the calendar timezone.'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Combined status                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Verifies all three integrations independently and composes a safe
   * overall status. Never exposes IDs.
   */
  function getIntegrationStatus() {
    var spreadsheet = safeVerify(verifySpreadsheet);
    var drive = safeVerify(verifyDriveFolder);
    var calendar = safeVerify(verifyCalendar);

    var statuses = [spreadsheet.status, drive.status, calendar.status];
    var allConnected = statuses.indexOf(STATUS_CONNECTED) === -1 ? false :
      statuses.every(function (s) { return s === STATUS_CONNECTED; });
    var anyError = statuses.some(function (s) {
      return s === STATUS_NOT_FOUND || s === STATUS_ACCESS_DENIED || s === STATUS_ERROR;
    });
    var anyNotConfigured = statuses.some(function (s) { return s === STATUS_NOT_CONFIGURED; });
    var allNotConfigured = statuses.every(function (s) { return s === STATUS_NOT_CONFIGURED; });

    var overallStatus;
    if (allConnected) {
      overallStatus = OVERALL_CONNECTED;
    } else if (allNotConfigured) {
      overallStatus = OVERALL_NOT_CONFIGURED;
    } else if (anyError) {
      overallStatus = OVERALL_CONNECTION_ERROR;
    } else {
      overallStatus = OVERALL_PARTIALLY_CONFIGURED;
    }

    return {
      overallStatus: overallStatus,
      spreadsheet: spreadsheet,
      drive: drive,
      calendar: calendar,
      lastChecked: DateService.nowIso()
    };
  }

  function safeVerify(verifier) {
    try {
      return verifier();
    } catch (e) {
      LoggerService.error('IntegrationService.verify', 'Integration check failed safely.', {
        code: e && e.code ? e.code : 'INTEGRATION_CONNECTION_ERROR'
      });
      return errorStatus('INTEGRATION_CONNECTION_ERROR', 'The integration could not be verified. Please try again.');
    }
  }

  /**
   * Lightweight status summary used by the system health endpoint.
   * Statuses only - no resource names.
   */
  function getIntegrationSummary() {
    var status = getIntegrationStatus();
    return {
      spreadsheet: status.spreadsheet.status,
      drive: status.drive.status,
      calendar: status.calendar.status,
      overall: status.overallStatus
    };
  }

  return {
    verifySpreadsheet: verifySpreadsheet,
    verifyDriveFolder: verifyDriveFolder,
    verifyCalendar: verifyCalendar,
    getIntegrationStatus: getIntegrationStatus,
    getIntegrationSummary: getIntegrationSummary,
    STATUS_NOT_CONFIGURED: STATUS_NOT_CONFIGURED,
    STATUS_CONNECTED: STATUS_CONNECTED,
    STATUS_CONNECTED_BUT_NOT_INITIALIZED: STATUS_CONNECTED_BUT_NOT_INITIALIZED,
    STATUS_NEEDS_INITIALIZATION: STATUS_NEEDS_INITIALIZATION,
    STATUS_NOT_FOUND: STATUS_NOT_FOUND,
    STATUS_ACCESS_DENIED: STATUS_ACCESS_DENIED,
    STATUS_ERROR: STATUS_ERROR,
    OVERALL_CONNECTED: OVERALL_CONNECTED,
    OVERALL_PARTIALLY_CONFIGURED: OVERALL_PARTIALLY_CONFIGURED,
    OVERALL_NOT_CONFIGURED: OVERALL_NOT_CONFIGURED,
    OVERALL_CONNECTION_ERROR: OVERALL_CONNECTION_ERROR
  };
})();

/* ------------------------------------------------------------------ */
/* Server functions for the frontend (safe, standard envelope)          */
/* ------------------------------------------------------------------ */

function verifySpreadsheetIntegration() {
  return ErrorService.wrap(function () {
    return ResponseService.success(IntegrationService.verifySpreadsheet(), 'Spreadsheet integration status retrieved.');
  })();
}

function verifyDriveIntegration() {
  return ErrorService.wrap(function () {
    return ResponseService.success(IntegrationService.verifyDriveFolder(), 'Drive integration status retrieved.');
  })();
}

function verifyCalendarIntegration() {
  return ErrorService.wrap(function () {
    return ResponseService.success(IntegrationService.verifyCalendar(), 'Calendar integration status retrieved.');
  })();
}

function getIntegrationStatus() {
  return ErrorService.wrap(function () {
    return ResponseService.success(IntegrationService.getIntegrationStatus(), 'Google integrations status retrieved.');
  })();
}
