/**
 * DriveFolderService.gs
 * Resolves and creates the Drive folder tree used by the Files module.
 *
 * Layout (docs/DEPLOYMENT_GUIDE.md):
 *   <ROOT_DRIVE_FOLDER_ID> (business root)
 *     Salikha/
 *       Backups/            <- backup service (own convention)
 *       Clients/<clientId>/
 *       Bookings/<bookingId>/
 *       Deployments/<deploymentId>/
 *       Expenses/<expenseId>/
 *       Purchases/<purchaseId>/
 *
 * Rules:
 * - The root folder ID lives in Script Properties (ROOT_DRIVE_FOLDER_ID),
 *   never in code and never exposed to the frontend.
 * - Folder paths are built from validated entity IDs only; user-provided
 *   strings never participate in path building (docs/SECURITY_MODEL.md).
 * - This service never deletes or unshares folders.
 */

var DriveFolderService = (function () {
  'use strict';

  var ROOT_KEY = 'ROOT_DRIVE_FOLDER_ID';

  var FOLDER_PREFIX = 'Salikha';

  var PATH_BY_ENTITY = {
    CLIENT: 'Clients',
    BOOKING: 'Bookings',
    DEPLOYMENT: 'Deployments',
    EXPENSE: 'Expenses',
    PURCHASE: 'Purchases'
  };

  function assertRootConfigured() {
    var rootId = Config.get(ROOT_KEY);
    if (!rootId) {
      throw ErrorService.create(ErrorService.CODES.DRIVE_FOLDER_NOT_FOUND, 'The Drive root folder is not configured. Set ROOT_DRIVE_FOLDER_ID in Script Properties.', null, ErrorService.CATEGORY_CONFIGURATION);
    }
    return rootId;
  }

  function getRootFolder() {
    var rootId = assertRootConfigured();
    var folder = DriveApp.getFolderById(rootId);
    if (!folder) {
      throw ErrorService.create(ErrorService.CODES.DRIVE_FOLDER_NOT_FOUND, 'The configured Drive root folder could not be opened.', null, ErrorService.CATEGORY_CONFIGURATION);
    }
    return folder;
  }

  function findChildByName(parent, name) {
    if (!parent) {
      return null;
    }
    var iterator = parent.getFolders();
    while (iterator.hasNext()) {
      var candidate = iterator.next();
      if (candidate.getName() === name) {
        return candidate;
      }
    }
    return null;
  }

  function getOrCreateChild(parent, name, errorCode) {
    var existing = findChildByName(parent, name);
    if (existing) {
      return existing;
    }
    var created = parent.createFolder(name);
    if (!created) {
      throw ErrorService.create(errorCode || ErrorService.CODES.DRIVE_FOLDER_CREATE_FAILED, 'The Drive folder could not be created: ' + name + '.', null, ErrorService.CATEGORY_INTEGRATION);
    }
    return created;
  }

  /**
   * Resolves the application root ("Salikha") folder, creating it if needed.
   */
  function getAppRootFolder() {
    var root = getRootFolder();
    return getOrCreateChild(root, FOLDER_PREFIX, ErrorService.CODES.DRIVE_FOLDER_CREATE_FAILED);
  }

  /**
   * Resolves the folder for an entity, creating it if needed.
   * @param {string} entityType CLIENT|BOOKING|DEPLOYMENT|EXPENSE|PURCHASE
   * @param {string} entityId validated immutable entity ID
   */
  function getEntityFolder(entityType, entityId) {
    var subPath = PATH_BY_ENTITY[entityType];
    if (!subPath) {
      throw ErrorService.create(ErrorService.CODES.FILE_ENTITY_PENDING, 'Folder layout is not defined for entity type: ' + entityType + '.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (!/^[A-Z]{2,5}-\d{4}-[A-Z0-9]{8}$/.test(entityId)) {
      throw ErrorService.create(ErrorService.CODES.FILE_ENTITY_PENDING, 'The entity ID is not a valid immutable ID.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var appRoot = getAppRootFolder();
    var group = getOrCreateChild(appRoot, subPath, ErrorService.CODES.DRIVE_FOLDER_CREATE_FAILED);
    return getOrCreateChild(group, entityId, ErrorService.CODES.DRIVE_FOLDER_CREATE_FAILED);
  }

  /**
   * Read-only status for integration checks: exposes whether the root
   * folder is configured and reachable. Never exposes the folder ID.
   */
  function getDriveStatus() {
    try {
var rootId = Config.get(ROOT_KEY);
      if (!rootId) {
        return { configured: false, label: 'NOT_CONFIGURED', detail: 'ROOT_DRIVE_FOLDER_ID is not set.' };
      }
      var folder = DriveApp.getFolderById(rootId);
      if (!folder) {
        return { configured: true, label: 'NOT_FOUND', detail: 'The configured root folder could not be opened.' };
      }
      return { configured: true, label: 'CONNECTED', detail: 'Drive root folder is reachable (' + folder.getName() + ').' };
    } catch (err) {
      return { configured: true, label: 'ERROR', detail: 'Drive access failed with a permission or API error.' };
    }
  }

  return {
    ROOT_KEY: ROOT_KEY,
    PATH_BY_ENTITY: PATH_BY_ENTITY,
    getRootFolder: getRootFolder,
    getAppRootFolder: getAppRootFolder,
    getEntityFolder: getEntityFolder,
    getDriveStatus: getDriveStatus
  };
})();
