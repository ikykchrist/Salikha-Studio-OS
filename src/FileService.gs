/**
 * FileService.gs
 * Files module (docs/PRODUCT_REQUIREMENTS.md §21, docs/SECURITY_MODEL.md §7):
 * stores file references in the Files sheet, never file content.
 *
 * Rules:
 * - Drive writes go through DriveFolderService into entity-scoped folders.
 * - Paths are built from validated entity IDs only.
 * - Trash is soft: driveFile.setTrashed(true) + is_trashed flag; the Files
 *   row is kept forever.
 * - The frontend only receives safe metadata.
 */

var FileService = (function () {
  'use strict';

  var MAX_FILENAME_LENGTH = 150;

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

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function nowIso() {
    return DateService.nowIso();
  }

  function toBool(value) {
    return value === true || String(value) === 'TRUE';
  }

  function sanitizeFilename(name) {
    var clean = String(name || '').replace(/[\/\\:*?"<>|]/g, '_').trim();
    if (clean.length === 0) {
      throw ErrorService.create(ErrorService.CODES.FILE_UPLOAD_FAILED, 'A filename is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (clean.length > MAX_FILENAME_LENGTH) {
      clean = clean.slice(0, MAX_FILENAME_LENGTH);
    }
    return clean;
  }

  function assertEntityExists(entityType, entityId) {
    var exists = false;
    if (entityType === 'CLIENT') {
      exists = !!ClientRepository.findById(entityId);
    } else if (entityType === 'BOOKING') {
      exists = !!BookingRepository.findById(entityId);
    } else if (entityType === 'DEPLOYMENT') {
      exists = !!DeploymentRepository.findDeploymentById(entityId);
    } else if (entityType === 'EXPENSE') {
      exists = !!ExpenseRepository.findExpenseById(entityId);
    } else if (entityType === 'PURCHASE') {
      exists = !!PurchaseRepository.findPurchaseById(entityId);
    }
    if (!exists) {
      throw ErrorService.create(ErrorService.CODES.FILE_NOT_FOUND, 'The ' + entityType.toLowerCase() + ' does not exist.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
  }

  /**
   * Uploads a file blob into the entity folder and records the reference.
   * @param {Object} payload { entityType, entityId, filename, contentType, blob }
   * @param {Object} actor { userId, role } - resolved from session when absent
   * @return {Object} public file record
   */
  function uploadFile(payload, actor) {
    if (!actor) {
      actor = AuditService.getActor();
    }
    assertDatabase();
    var entityType = String(payload.entityType || '').toUpperCase();
    if (FilePermissionService.ENTITY_TYPES.indexOf(entityType) === -1) {
      throw ErrorService.create(ErrorService.CODES.FILE_ENTITY_PENDING, 'Unsupported entity type: ' + entityType + '.', null, ErrorService.CATEGORY_VALIDATION);
    }
    FilePermissionService.assertCanUpload(actor, entityType);
    if (!payload.entityId) {
      throw ErrorService.create(ErrorService.CODES.FILE_NOT_FOUND, 'An entity ID is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    assertEntityExists(entityType, payload.entityId);
    if (entityType === 'DEPLOYMENT' && actor.role === 'CREW' && !FilePermissionService.canManageDeployment(actor, payload.entityId)) {
      throw ErrorService.create(ErrorService.CODES.FILE_PERMISSION_DENIED, 'You are not assigned to this deployment.', null, ErrorService.CATEGORY_PERMISSION);
    }

    var filename = sanitizeFilename(payload.filename);
    var folder = DriveFolderService.getEntityFolder(entityType, payload.entityId);

    var created = null;
    if (payload.blob) {
      try {
        created = folder.createFile(payload.blob);
      } catch (err) {
        throw ErrorService.create(ErrorService.CODES.FILE_UPLOAD_FAILED, 'The file could not be uploaded to Drive.', null, ErrorService.CATEGORY_INTEGRATION);
      }
    } else if (payload.driveFileId) {
      var existing = DriveApp.getFileById(payload.driveFileId);
      if (!existing) {
        throw ErrorService.create(ErrorService.CODES.FILE_UPLOAD_FAILED, 'The Drive file could not be opened.', null, ErrorService.CATEGORY_INTEGRATION);
      }
      existing.moveTo(folder);
      created = existing;
    } else {
      throw ErrorService.create(ErrorService.CODES.FILE_UPLOAD_FAILED, 'A file blob or Drive file ID is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!created || !created.getId()) {
      throw ErrorService.create(ErrorService.CODES.FILE_UPLOAD_FAILED, 'The file could not be uploaded to Drive.', null, ErrorService.CATEGORY_INTEGRATION);
    }

    var fileId = IdService.generateId('FL');
    var now = nowIso();
    var record = {
      file_id: fileId,
      drive_file_id: created.getId(),
      drive_folder_id: folder.getId(),
      filename: filename,
      content_type: String(payload.contentType || '').slice(0, 100),
      entity_type: entityType,
      entity_id: payload.entityId,
      size_bytes: number(created.getSize()),
      uploaded_by: actor.userId || 'unknown-user',
      uploaded_at: now,
      is_trashed: 'FALSE',
      trashed_at: '',
      trashed_by: '',
      created_at: now,
      created_by: actor.userId || 'unknown-user',
      updated_at: now,
      updated_by: actor.userId || 'unknown-user',
      version: 1
    };

    FileRepository.insertRow(record);
    AuditService.info(AuditService.ACTIONS.FILE_UPLOADED, entityType, payload.entityId, 'File uploaded: ' + filename, {
      fileId: fileId,
      filename: filename
    });
    return toPublic(record);
  }

  /**
   * Trashes a file (soft delete). OWNER/ADMIN only.
   */
  function trashFile(fileId, actor) {
    if (!actor) {
      actor = AuditService.getActor();
    }
    assertDatabase();
    FilePermissionService.assertCanTrash(actor);
    var record = FileRepository.findById(fileId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.FILE_NOT_FOUND, 'The file record was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (toBool(record.is_trashed)) {
      throw ErrorService.create(ErrorService.CODES.FILE_TRASH_FAILED, 'The file is already trashed.', null, ErrorService.CATEGORY_CONFLICT);
    }
    if (record.drive_file_id) {
      try {
        var driveFile = DriveApp.getFileById(record.drive_file_id);
        if (driveFile) {
          driveFile.setTrashed(true);
        }
      } catch (err) {
        throw ErrorService.create(ErrorService.CODES.FILE_TRASH_FAILED, 'The Drive file could not be trashed.', null, ErrorService.CATEGORY_INTEGRATION);
      }
    }
    var now = nowIso();
    FileRepository.updateRow(fileId, {
      is_trashed: 'TRUE',
      trashed_at: now,
      trashed_by: actor.userId || 'unknown-user',
      updated_at: now,
      updated_by: actor.userId || 'unknown-user',
      version: number(record.version) + 1
    });
    AuditService.info(AuditService.ACTIONS.FILE_TRASHED, record.entity_type, record.entity_id, 'File trashed: ' + record.filename, {
      fileId: fileId
    });
    return toPublic(FileRepository.findById(fileId));
  }

  /**
   * Lists files for an entity, honoring role scoping.
   */
  function listFiles(entityType, entityId, actor) {
    if (!actor) {
      actor = AuditService.getActor();
    }
    assertDatabase();
    if (FilePermissionService.ENTITY_TYPES.indexOf(entityType) === -1) {
      throw ErrorService.create(ErrorService.CODES.FILE_ENTITY_PENDING, 'Unknown entity type: ' + entityType + '.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!FilePermissionService.canRead(actor, entityType)) {
      throw ErrorService.create(ErrorService.CODES.FILE_PERMISSION_DENIED, 'You are not allowed to view files for this record.', null, ErrorService.CATEGORY_PERMISSION);
    }
    if (entityType === 'DEPLOYMENT' && actor.role === 'CREW' && !FilePermissionService.canManageDeployment(actor, entityId)) {
      throw ErrorService.create(ErrorService.CODES.FILE_PERMISSION_DENIED, 'You are not assigned to this deployment.', null, ErrorService.CATEGORY_PERMISSION);
    }
    var rows = FileRepository.listByEntity(entityType, entityId);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push(toPublic(rows[i]));
    }
    return out;
  }

  /**
   * Summary counts for the Files page.
   */
  function getFileSummary(actor) {
    if (!actor) {
      actor = AuditService.getActor();
    }
    assertDatabase();
    var rows = FileRepository.listAll();
    var summary = {
      totalFiles: rows.length,
      totalTrashed: 0,
      byEntity: {}
    };
    var types = FilePermissionService.ENTITY_TYPES;
    for (var i = 0; i < types.length; i++) {
      summary.byEntity[types[i]] = 0;
    }
    for (var j = 0; j < rows.length; j++) {
      if (toBool(rows[j].is_trashed)) {
        summary.totalTrashed++;
      }
      if (summary.byEntity[rows[j].entity_type] !== undefined) {
        summary.byEntity[rows[j].entity_type]++;
      }
    }
    return summary;
  }

  function toPublic(record) {
    return {
      fileId: record.file_id,
      driveFileId: record.drive_file_id,
      driveFolderId: record.drive_folder_id,
      filename: record.filename,
      contentType: record.content_type,
      entityType: record.entity_type,
      entityId: record.entity_id,
      sizeBytes: number(record.size_bytes),
      uploadedBy: record.uploaded_by,
      uploadedAt: record.uploaded_at,
      isTrashed: toBool(record.is_trashed),
      trashedAt: record.trashed_at,
      trashedBy: record.trashed_by
    };
  }

  return {
    uploadFile: uploadFile,
    trashFile: trashFile,
    listFiles: listFiles,
    getFileSummary: getFileSummary
  };
})();