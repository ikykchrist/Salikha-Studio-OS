/**
 * RepositoryService.gs
 * Reusable Google Sheets repository abstraction.
 *
 * Provides safe sheet access, header validation, record reads/writes,
 * and batch operations. This layer is intentionally free of financial
 * business decisions; services enforce the rules.
 *
 * Row numbers are used internally ONLY after the immutable ID has been
 * verified against the stored row. Row numbers are never exposed.
 */

var RepositoryService = (function () {
  'use strict';

  var HEADER_ROW = 1;

  /**
   * Returns the configured spreadsheet or throws CONFIGURATION_ERROR.
   */
  function getSpreadsheet() {
    var id;
    try {
      id = Config.getSpreadsheetId_();
    } catch (e) {
      throw ErrorService.create(
        ErrorService.CODES.CONFIGURATION_ERROR,
        'The spreadsheet is not configured. Set SPREADSHEET_ID in script properties and run database initialization.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    var spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(id);
    } catch (e) {
      throw ErrorService.create(
        ErrorService.CODES.CONFIGURATION_ERROR,
        'The configured spreadsheet could not be accessed. Check that SPREADSHEET_ID is correct and the account has access.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    if (!spreadsheet) {
      throw ErrorService.create(
        ErrorService.CODES.CONFIGURATION_ERROR,
        'The configured spreadsheet could not be found.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    return spreadsheet;
  }

  /**
   * Returns a sheet or throws SHEET_NOT_FOUND.
   */
  function getSheet(sheetName) {
    var spreadsheet = getSpreadsheet();
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw ErrorService.create(
        ErrorService.CODES.SHEET_NOT_FOUND,
        'Required sheet "' + sheetName + '" does not exist. Run database initialization first.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return sheet;
  }

  /**
   * Reads the header row for a sheet.
   */
  function readHeaders(sheet) {
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) {
      return [];
    }
    var values = sheet.getRange(HEADER_ROW, 1, 1, lastColumn).getValues();
    return normalizeRow(values[0] || []);
  }

  /**
   * Validates that a sheet's headers match the canonical schema.
   * Throws SCHEMA_MISMATCH when they differ.
   */
  function validateSchema(sheetName, sheet) {
    var expected = SheetSchemaService.getHeaders(sheetName);
    var actual = readHeaders(sheet);
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
        'Sheet "' + sheetName + '" headers do not match the approved schema. Refusing to write.',
        { expected: expected, actual: actual },
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return true;
  }

  /**
   * Normalizes a row: blanks become empty strings, numbers stay numbers,
   * dates stay Dates.
   */
  function normalizeRow(row) {
    var out = [];
    for (var i = 0; i < row.length; i++) {
      var value = row[i];
      if (value === null || value === undefined) {
        out.push('');
      } else if (typeof value === 'string' && value === '') {
        out.push('');
      } else {
        out.push(value);
      }
    }
    return out;
  }

  /**
   * Maps sheet rows (including header) to objects keyed by header name.
   */
  function mapRowsToObjects(sheetName, rows, headers) {
    var headerMap = SheetSchemaService.buildHeaderMap(headers);
    var idField = SheetSchemaService.getIdField(sheetName);
    var objects = [];
    for (var r = 1; r < rows.length; r++) {
      var row = normalizeRow(rows[r]);
      var obj = {};
      for (var key in headerMap) {
        if (Object.prototype.hasOwnProperty.call(headerMap, key)) {
          obj[key] = row[headerMap[key]] !== undefined ? row[headerMap[key]] : '';
        }
      }
      obj.__rowIndex = r; // internal only; never exposed to the frontend
      objects.push(obj);
    }
    return objects;
  }

  /**
   * Maps an object to a full row array aligned with the headers.
   */
  function mapObjectToRow(sheetName, obj, headers) {
    var headerMap = SheetSchemaService.buildHeaderMap(headers);
    var row = [];
    for (var i = 0; i < headers.length; i++) {
      row.push('');
    }
    for (var key in headerMap) {
      if (Object.prototype.hasOwnProperty.call(headerMap, key) && obj[key] !== undefined) {
        row[headerMap[key]] = obj[key];
      }
    }
    return row;
  }

  function stripInternal(rowObject) {
    var clean = {};
    var keys = Object.keys(rowObject);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== '__rowIndex') {
        clean[keys[i]] = rowObject[keys[i]];
      }
    }
    return clean;
  }

  /**
   * Reads all records from a sheet as header-keyed objects.
   * @param {string} sheetName
   * @return {Object[]} Records with __rowIndex internally.
   */
  function readAll(sheetName) {
    var sheet = getSheet(sheetName);
    validateSchema(sheetName, sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < HEADER_ROW) {
      return [];
    }
    var rows = sheet.getRange(HEADER_ROW, 1, lastRow, sheet.getLastColumn()).getValues();
    var headers = normalizeRow(rows[0]);
    return mapRowsToObjects(sheetName, rows, headers);
  }

  /**
   * Finds a record by immutable ID.
   * @return {Object|null}
   */
  function findById(sheetName, id) {
    var records = readAll(sheetName);
    var idField = SheetSchemaService.getIdField(sheetName);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i][idField]) === String(id)) {
        return records[i];
      }
    }
    return null;
  }

  /**
   * Finds records where a field equals a value.
   * @return {Object[]}
   */
  function findByField(sheetName, field, value) {
    var records = readAll(sheetName);
    var matches = [];
    for (var i = 0; i < records.length; i++) {
      if (String(records[i][field]) === String(value)) {
        matches.push(records[i]);
      }
    }
    return matches;
  }

  /**
   * Appends one record. Returns the new row index.
   */
  function appendRecord(sheetName, obj) {
    var sheet = getSheet(sheetName);
    validateSchema(sheetName, sheet);
    var headers = SheetSchemaService.getHeaders(sheetName);
    var row = mapObjectToRow(sheetName, obj, headers);
    var lastRow = sheet.getLastRow();
    var targetRow = Math.max(lastRow + 1, HEADER_ROW + 1);
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
    return targetRow;
  }

  /**
   * Appends many records in one batch write.
   * @param {string} sheetName
   * @param {Object[]} objects
   */
  function batchAppend(sheetName, objects) {
    if (!objects || objects.length === 0) {
      return;
    }
    var sheet = getSheet(sheetName);
    validateSchema(sheetName, sheet);
    var headers = SheetSchemaService.getHeaders(sheetName);
    var rows = [];
    for (var i = 0; i < objects.length; i++) {
      rows.push(mapObjectToRow(sheetName, objects[i], headers));
    }
    var lastRow = sheet.getLastRow();
    var targetRow = Math.max(lastRow + 1, HEADER_ROW + 1);
    sheet.getRange(targetRow, 1, rows.length, headers.length).setValues(rows);
  }

  /**
   * Updates a record by immutable ID. The ID column is never modified.
   */
  function updateById(sheetName, id, patch) {
    var record = findById(sheetName, id);
    if (!record) {
      return false;
    }
    var sheet = getSheet(sheetName);
    var headers = SheetSchemaService.getHeaders(sheetName);
    var rowIndex = record.__rowIndex + 1;
    var idField = SheetSchemaService.getIdField(sheetName);
    var row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    var headerMap = SheetSchemaService.buildHeaderMap(headers);
    for (var key in headerMap) {
      if (Object.prototype.hasOwnProperty.call(headerMap, key) && patch[key] !== undefined) {
        if (key === idField) {
          continue; // immutable IDs are never overwritten
        }
        row[headerMap[key]] = patch[key];
      }
    }
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
    return true;
  }

  /**
   * Batch update by immutable ID list.
   * @param {string} sheetName
   * @param {Array<{id: string, patch: Object}>} updates
   */
  function batchUpdateById(sheetName, updates) {
    if (!updates || updates.length === 0) {
      return;
    }
    var records = readAll(sheetName);
    var idField = SheetSchemaService.getIdField(sheetName);
    var sheet = getSheet(sheetName);
    var headers = SheetSchemaService.getHeaders(sheetName);
    var byId = {};
    for (var i = 0; i < records.length; i++) {
      byId[String(records[i][idField])] = records[i];
    }
    var rowsToWrite = [];
    var rowIndexes = [];
    var headerMap = SheetSchemaService.buildHeaderMap(headers);
    for (var u = 0; u < updates.length; u++) {
      var target = byId[String(updates[u].id)];
      if (!target) {
        continue;
      }
      var rowIndex = target.__rowIndex + 1;
      var row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
      var patch = updates[u].patch;
      for (var key in headerMap) {
        if (Object.prototype.hasOwnProperty.call(headerMap, key) && patch[key] !== undefined && key !== idField) {
          row[headerMap[key]] = patch[key];
        }
      }
      rowsToWrite.push(row);
      rowIndexes.push(rowIndex);
    }
    if (rowsToWrite.length > 0) {
      for (var w = 0; w < rowIndexes.length; w++) {
        sheet.getRange(rowIndexes[w], 1, 1, headers.length).setValues([rowsToWrite[w]]);
      }
    }
  }

  /**
   * Converts snake_case keys to camelCase for public API records.
   * Example: current_balance_cached -> currentBalanceCached.
   */
  function snakeToCamel(value) {
    return String(value).replace(/_([a-z])/g, function (match, letter) {
      return letter.toUpperCase();
    });
  }

  /**
   * Physically removes rows where a field equals a value.
   * CONTRACT: used only for editor-owned, non-financial rows
   * (package items). Financial/operational rows are never deleted.
   * @param {string} sheetName
   * @param {string} field
   * @param {*} value
   * @return {number} Rows removed.
   */
  function clearRowsByField(sheetName, field, value) {
    var sheet = getSheet(sheetName);
    validateSchema(sheetName, sheet);
    var records = readAll(sheetName);
    var rowIndexes = [];
    for (var i = 0; i < records.length; i++) {
      if (String(records[i][field]) === String(value)) {
        rowIndexes.push(records[i].__rowIndex + 1);
      }
    }
    rowIndexes.sort(function (a, b) { return b - a; });
    for (var r = 0; r < rowIndexes.length; r++) {
      sheet.deleteRow(rowIndexes[r]);
    }
    return rowIndexes.length;
  }

  /**
   * Returns a clean public record: internal row indexes removed and
   * header keys converted to camelCase. This is the only shape the
   * frontend receives.
   */
  function toPublicRecord(record) {
    if (!record) {
      return null;
    }
    var clean = stripInternal(record);
    var out = {};
    var keys = Object.keys(clean);
    for (var i = 0; i < keys.length; i++) {
      out[snakeToCamel(keys[i])] = clean[keys[i]];
    }
    return out;
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    readHeaders: readHeaders,
    validateSchema: validateSchema,
    readAll: readAll,
    findById: findById,
    findByField: findByField,
    appendRecord: appendRecord,
    batchAppend: batchAppend,
    updateById: updateById,
    batchUpdateById: batchUpdateById,
    clearRowsByField: clearRowsByField,
    mapRowsToObjects: mapRowsToObjects,
    mapObjectToRow: mapObjectToRow,
    toPublicRecord: toPublicRecord,
    stripInternal: stripInternal,
    HEADER_ROW: HEADER_ROW
  };
})();
