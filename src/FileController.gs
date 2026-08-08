/**
 * FileController.gs
 * Server entry points for the Files module (Sprint 8).
 *
 * Authorization posture: role checks land with the Users sheet; today the
 * actor is recorded and per-entity-type permission decisions are prepared
 * in FilePermissionService (temporary boundary - docs/SECURITY_MODEL.md).
 */

function getFiles(payload) {
  return ErrorService.wrap(function () {
    var actor = AuditService.getActor();
    var entityType = payload && payload.entityType ? String(payload.entityType).toUpperCase() : '';
    var entityId = payload && payload.entityId ? String(payload.entityId) : '';
    var rows = FileService.listFiles(entityType, entityId, actor);
    return ResponseService.success(rows, 'Files retrieved.');
  })();
}

function uploadFile(payload) {
  return ErrorService.wrap(function () {
    var actor = AuditService.getActor();
    var record = FileService.uploadFile(payload || {}, actor);
    return ResponseService.success(record, 'File uploaded.');
  })();
}

function trashFile(fileId) {
  return ErrorService.wrap(function () {
    var actor = AuditService.getActor();
    var record = FileService.trashFile(fileId, actor);
    return ResponseService.success(record, 'File moved to trash. History preserved.');
  })();
}

function getFilesSummary() {
  return ErrorService.wrap(function () {
    var actor = AuditService.getActor();
    return ResponseService.success(FileService.getFileSummary(actor), 'Files summary retrieved.');
  })();
}