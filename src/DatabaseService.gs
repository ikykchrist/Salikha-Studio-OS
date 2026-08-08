/**
 * DatabaseService.gs
 * Sprint 1 database initialization and status.
 *
 * Creates ONLY the Sprint 1 sheets. Never deletes or silently replaces
 * existing sheets. Safe to run more than once. Requires SPREADSHEET_ID
 * to be configured.
 */

var DatabaseService = (function () {
  'use strict';

  var META_KEY_SCHEMA_VERSION = 'database_schema_version';
  var META_KEY_INITIALIZED_AT = 'database_initialized_at';
  var META_KEY_APPLICATION_VERSION = 'application_version';
  var META_KEY_BUSINESS_TIMEZONE = 'business_timezone';
  var META_KEY_BUSINESS_CURRENCY = 'business_currency';

  /**
   * True when the spreadsheet is configured and the Sprint 1 schema
   * version metadata exists.
   */
  function isInitialized() {
    try {
      if (!Config.hasProperty('SPREADSHEET_ID')) {
        return false;
      }
      var record = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, META_KEY_SCHEMA_VERSION);
      return record !== null;
    } catch (e) {
      return false;
    }
  }

  /**
   * Safe status snapshot for the frontend. Never exposes IDs or values
   * of sensitive properties.
   */
  function getInitializationStatus() {
    var spreadsheetConfigured = Config.hasProperty('SPREADSHEET_ID');
    var result = {
      appName: Config.getAppName(),
      appVersion: Config.getAppVersion(),
      environment: Config.getAppEnv(),
      timezone: Config.getBusinessTimezone_(),
      currency: Config.getBusinessCurrency_(),
      spreadsheetConfigured: spreadsheetConfigured,
      initialized: false,
      schemaVersion: null,
      initializedAt: null,
      sheets: []
    };
    if (!spreadsheetConfigured) {
      result.initialized = false;
      result.message = 'SPREADSHEET_ID is not configured. Set it in script properties, then run initialization.';
      return result;
    }
    try {
      result.initialized = isInitialized();
      var versionRecord = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, META_KEY_SCHEMA_VERSION);
      var atRecord = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, META_KEY_INITIALIZED_AT);
      result.schemaVersion = versionRecord ? versionRecord.metadata_value : null;
      result.initializedAt = atRecord ? atRecord.metadata_value : null;
      result.sheets = buildSheetStatus();
    } catch (e) {
      result.initialized = false;
      result.message = 'Database access issue: ' + ErrorService.toUserMessage(e);
    }
    return result;
  }

  function buildSheetStatus() {
    var spreadsheet = RepositoryService.getSpreadsheet();
    var sheets = spreadsheet.getSheets();
    var out = [];
    var names = {};
    for (var i = 0; i < sheets.length; i++) {
      names[sheets[i].getName()] = true;
    }
    for (var s = 0; s < SheetSchemaService.APPROVED_SHEETS.length; s++) {
      var name = SheetSchemaService.APPROVED_SHEETS[s];
      out.push({
        name: name,
        exists: !!names[name],
        headersValid: false
      });
    }
    for (var o = 0; o < out.length; o++) {
      if (!out[o].exists) {
        continue;
      }
      try {
        var sheet = spreadsheet.getSheetByName(out[o].name);
        var expected = SheetSchemaService.getHeaders(out[o].name);
        var actual = RepositoryService.readHeaders(sheet);
        var valid = actual.length === expected.length;
        if (valid) {
          for (var h = 0; h < expected.length; h++) {
            if (actual[h] !== expected[h]) {
              valid = false;
              break;
            }
          }
        }
        out[o].headersValid = valid;
      } catch (e) {
        out[o].headersValid = false;
      }
    }
    return out;
  }

  /**
   * Creates missing Sprint 1 sheets, validates existing ones, applies
   * formats, stores metadata, seeds system categories, and audits.
   * Idempotent and lock-protected.
   */
  function initializeDatabase() {
    var spreadsheetId = Config.getSpreadsheetId_();
    if (!spreadsheetId) {
      throw ErrorService.create(
        ErrorService.CODES.CONFIGURATION_ERROR,
        'SPREADSHEET_ID is not configured. Set it in Apps Script properties before initialization.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }

    return LockManager.run(function () {
      var spreadsheet = RepositoryService.getSpreadsheet();
      var existingNames = {};
      var sheets = spreadsheet.getSheets();
      for (var i = 0; i < sheets.length; i++) {
        existingNames[sheets[i].getName()] = sheets[i];
      }

      var created = [];
      var validated = [];
      for (var s = 0; s < SheetSchemaService.APPROVED_SHEETS.length; s++) {
        var name = SheetSchemaService.APPROVED_SHEETS[s];
        if (existingNames[name]) {
          validateExistingHeaders(name, existingNames[name]);
          validated.push(name);
        } else {
          var sheet = spreadsheet.insertSheet(name);
          writeHeaders(sheet, name);
          applyFormatsAndValidation(sheet, name);
          created.push(name);
        }
      }

      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      upsertMetadata(META_KEY_SCHEMA_VERSION, SheetSchemaService.SCHEMA_VERSION, 'Database schema version (approved schema).', actor, now);
      upsertMetadata(META_KEY_INITIALIZED_AT, now, 'First successful Sprint 1 initialization.', actor, now);
      upsertMetadata(META_KEY_APPLICATION_VERSION, Config.getAppVersion(), 'Application version at initialization.', actor, now);
      upsertMetadata(META_KEY_BUSINESS_TIMEZONE, Config.getBusinessTimezone_(), 'Business timezone.', actor, now);
      upsertMetadata(META_KEY_BUSINESS_CURRENCY, Config.getBusinessCurrency_(), 'Business currency.', actor, now);

      var seeded = FinancialCategoryService.seedDefaults(actor);
      var addedSystem = FinancialCategoryService.ensureSystemCategories(actor);

      AuditService.info(AuditService.ACTIONS.DATABASE_INITIALIZED, 'SystemMetadata', META_KEY_SCHEMA_VERSION,
        'Database initialized. Created sheets: ' + (created.length || 'none') + '; validated: ' + validated.length + '; categories seeded: ' + seeded.seeded + '.');
      LoggerService.info('DatabaseService.initializeDatabase', 'Initialization complete.', {
        created: created.length,
        validated: validated.length,
        seededCategories: seeded.seeded
      });

      return {
        schemaVersion: SheetSchemaService.SCHEMA_VERSION,
        createdSheets: created,
        validatedSheets: validated,
        categoriesSeeded: seeded.seeded + addedSystem,
        initializedAt: now
      };
    });
  }

  /**
   * Existing sheets must match the canonical headers exactly; otherwise
   * a SCHEMA_MISMATCH conflict is raised and nothing is altered.
   */
  function validateExistingHeaders(sheetName, sheet) {
    var expected = SheetSchemaService.getHeaders(sheetName);
    var actual = RepositoryService.readHeaders(sheet);
    var mismatch = actual.length !== expected.length;
    if (!mismatch) {
      for (var i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
          mismatch = true;
          break;
        }
      }
    }
    if (mismatch) {
      throw ErrorService.create(
        ErrorService.CODES.SCHEMA_MISMATCH,
        'Sheet "' + sheetName + '" exists with headers that do not match the approved schema. Refusing to initialize until the sheet is corrected manually.',
        { expected: expected, actual: actual },
        ErrorService.CATEGORY_CONFLICT
      );
    }
  }

  function writeHeaders(sheet, sheetName) {
    var headers = SheetSchemaService.getHeaders(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  function applyFormatsAndValidation(sheet, sheetName) {
    var schema = SheetSchemaService.getSchema(sheetName);
    var headers = schema.headers;
    var headerMap = SheetSchemaService.buildHeaderMap(headers);
    var lastRow = Math.max(sheet.getLastRow(), 2);
    var rowCount = Math.max(1000 - (lastRow - 1), 1);

    for (var h = 0; h < headers.length; h++) {
      var header = headers[h];
      var column = headerMap[header] + 1;
      var range = sheet.getRange(lastRow, column, rowCount, 1);
      if (schema.dateFormats[header]) {
        range.setNumberFormat(schema.dateFormats[header]);
      }
      if (schema.numberFormats[header]) {
        range.setNumberFormat(schema.numberFormats[header]);
      }
      if (sheetName === SheetSchemaService.SHEET_CASH_ACCOUNTS && header === 'account_type') {
        applyDropdown(range, CashAccountService.TYPES);
      }
      if (sheetName === SheetSchemaService.SHEET_CASH_TRANSACTIONS && header === 'transaction_type') {
        applyDropdown(range, CashTransactionService.TYPES);
      }
      if (sheetName === SheetSchemaService.SHEET_CASH_TRANSACTIONS && header === 'status') {
        applyDropdown(range, [CashTransactionService.STATUS_POSTED, CashTransactionService.STATUS_VOIDED]);
      }
      if (sheetName === SheetSchemaService.SHEET_CASH_TRANSACTIONS && header === 'direction') {
        applyDropdown(range, [CashTransactionService.DIRECTION_INFLOW, CashTransactionService.DIRECTION_OUTFLOW]);
      }
if (sheetName === SheetSchemaService.SHEET_DAILY_RECONCILIATIONS && header === 'status') {
        applyDropdown(range, [ReconciliationService.STATUS_DRAFT, ReconciliationService.STATUS_RECONCILED, ReconciliationService.STATUS_REOPENED]);
      }
      if (sheetName === SheetSchemaService.SHEET_EXPENSES && header === 'approval_status') {
        applyDropdown(range, ExpenseService.STATUSES);
      }
      if (sheetName === SheetSchemaService.SHEET_EXPENSES && header === 'cost_type') {
        applyDropdown(range, ExpenseService.COST_TYPES);
      }
      if (sheetName === SheetSchemaService.SHEET_EXPENSES && header === 'payment_method') {
        applyDropdown(range, ExpenseService.PAYMENT_METHODS);
      }
      if (sheetName === SheetSchemaService.SHEET_EVENT_DEPLOYMENTS && header === 'status') {
        applyDropdown(range, DeploymentService.STATUSES);
      }
      if (sheetName === SheetSchemaService.SHEET_TASKS && header === 'status') {
        applyDropdown(range, TaskService.STATUSES);
      }
      if (sheetName === SheetSchemaService.SHEET_TASKS && header === 'task_type') {
        applyDropdown(range, TaskService.TASK_TYPES);
      }
      if (sheetName === SheetSchemaService.SHEET_DEPLOYMENT_INCIDENTS && header === 'severity') {
        applyDropdown(range, DeploymentService.SEVERITIES);
      }
      if (sheetName === SheetSchemaService.SHEET_CREW && header === 'pay_rate_type') {
        applyDropdown(range, CrewService.PAY_RATE_TYPES);
      }
      if (sheetName === SheetSchemaService.SHEET_CREW_ASSIGNMENTS && header === 'pay_status') {
        applyDropdown(range, CrewService.PAY_STATUSES);
      }
      if (sheetName === SheetSchemaService.SHEET_PARTNERS && header === 'partner_type') {
        applyDropdown(range, PartnerService.PARTNER_TYPES);
      }
      if (sheetName === SheetSchemaService.SHEET_PARTNER_COMMISSIONS && header === 'status') {
        applyDropdown(range, PartnerService.COMMISSION_STATUSES);
      }
    }
  }

  function applyDropdown(range, values) {
    try {
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).build();
      range.setDataValidation(rule);
    } catch (ignored) {
      /* dropdowns are a UX convenience only; never a trust boundary */
    }
  }

  function upsertMetadata(key, value, description, actor, now) {
    var existing = RepositoryService.findById(SheetSchemaService.SHEET_SYSTEM_METADATA, key);
    if (existing) {
      RepositoryService.updateById(SheetSchemaService.SHEET_SYSTEM_METADATA, key, {
        metadata_value: value,
        description: description,
        updated_at: now,
        updated_by: actor.userId
      });
    } else {
      RepositoryService.appendRecord(SheetSchemaService.SHEET_SYSTEM_METADATA, {
        metadata_key: key,
        metadata_value: value,
        description: description,
        updated_at: now,
        updated_by: actor.userId
      });
    }
  }

  /**
   * Development-only reset. Clears Sprint 1 test data rows, preserves
   * headers and metadata. Refuses to run outside APP_ENV=development.
   */
  function developmentReset(confirmationText) {
    if (Config.getAppEnv() !== 'development') {
      throw ErrorService.create(
        ErrorService.CODES.PERMISSION_DENIED,
        'Development reset is disabled outside the development environment.',
        null,
        ErrorService.CATEGORY_PERMISSION
      );
    }
    if (String(confirmationText || '').trim() !== 'RESET SPRINT 1 FINANCE DATA') {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'Exact confirmation text is required to reset development finance data.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var spreadsheet = RepositoryService.getSpreadsheet();
      var cleared = [];
var dataSheets = [
        SheetSchemaService.SHEET_CASH_TRANSACTIONS,
        SheetSchemaService.SHEET_DAILY_RECONCILIATIONS,
        SheetSchemaService.SHEET_AUDIT_LOGS,
        SheetSchemaService.SHEET_EXPENSES,
        SheetSchemaService.SHEET_BOOKING_COSTS
      ];
      for (var i = 0; i < dataSheets.length; i++) {
        var sheet = spreadsheet.getSheetByName(dataSheets[i]);
        if (!sheet) {
          continue;
        }
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
        }
        cleared.push(dataSheets[i]);
      }
      var accountsSheet = spreadsheet.getSheetByName(SheetSchemaService.SHEET_CASH_ACCOUNTS);
      if (accountsSheet && accountsSheet.getLastRow() > 1) {
        accountsSheet.getRange(2, 1, accountsSheet.getLastRow() - 1, accountsSheet.getLastColumn()).clearContent();
        cleared.push(SheetSchemaService.SHEET_CASH_ACCOUNTS);
      }
      var categoriesSheet = spreadsheet.getSheetByName(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
      if (categoriesSheet && categoriesSheet.getLastRow() > 1) {
        categoriesSheet.getRange(2, 1, categoriesSheet.getLastRow() - 1, categoriesSheet.getLastColumn()).clearContent();
        cleared.push(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
      }
      FinancialCategoryService.seedDefaults(actor);
      AuditService.warn(AuditService.ACTIONS.DEVELOPMENT_RESET, 'SystemMetadata', '',
        'Development finance data reset executed. Sheets cleared: ' + cleared.join(', ') + '.');
      LoggerService.warn('DatabaseService.developmentReset', 'Development finance data reset executed.', {
        cleared: cleared
      });
      return { reset: true, clearedSheets: cleared };
    });
  }

  return {
    isInitialized: isInitialized,
    getInitializationStatus: getInitializationStatus,
    initializeDatabase: initializeDatabase,
    developmentReset: developmentReset
  };
})();





