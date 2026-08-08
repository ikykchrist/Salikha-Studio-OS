/**
 * FileRepository.gs
 * Sheet access layer for the Files sheet (docs/DATABASE_SCHEMA.md §10.1).
 * All reads use the header map; no hard-coded column indices.
 */

var FileRepository = (function () {
  'use strict';

  // Plain string: resolved against SheetSchemaService at call time
  // (this file loads before SheetSchemaService alphabetically).
  var SHEET_NAME = 'Files';

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

  function listAll() {
    assertDatabase();
    return RepositoryService.readAll(SHEET_NAME);
  }

  function findById(fileId) {
    assertDatabase();
    return RepositoryService.findById(SHEET_NAME, fileId);
  }

  function findByEntityType(entityType) {
    assertDatabase();
    return RepositoryService.findByField(SHEET_NAME, 'entity_type', entityType);
  }

  function listByEntity(entityType, entityId) {
    assertDatabase();
    var rows = listAll();
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].entity_type === entityType && rows[i].entity_id === entityId) {
        out.push(rows[i]);
      }
    }
    out.sort(function (a, b) {
      return String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || ''));
    });
    return out;
  }

  function insertRow(record) {
    assertDatabase();
    RepositoryService.appendRecord(SHEET_NAME, record);
    return record;
  }

  function updateRow(fileId, updates) {
    assertDatabase();
    RepositoryService.updateById(SHEET_NAME, fileId, updates);
  }

  function count() {
    assertDatabase();
    return listAll().length;
  }

  return {
    SHEET_NAME: SHEET_NAME,
    listAll: listAll,
    findById: findById,
    findByEntityType: findByEntityType,
    listByEntity: listByEntity,
    insertRow: insertRow,
    updateRow: updateRow,
    count: count
  };
})();