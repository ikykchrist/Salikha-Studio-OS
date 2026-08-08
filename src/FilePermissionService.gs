/**
 * FilePermissionService.gs
 * Capability checks for the Files module.
 *
 * Posture (docs/SECURITY_MODEL.md §2.1): full role-based authorization
 * arrives with the Users sheet in a future sprint. Until then this service
 * exposes the intended matrix and the actor is resolved from the session
 * (temporary boundary, exactly like ReportPermissionService).
 *
 * Matrix (docs/ROLE_PERMISSIONS.md §2):
 *   OWNER/ADMIN: upload + trash + view for every entity type
 *   OPERATIONS : CLIENT, BOOKING, DEPLOYMENT, PURCHASE
 *   FINANCE    : EXPENSE, PURCHASE
 *   CREW       : read-only on deployments they are assigned to
 *   VIEWER     : read-only
 *   Trash      : OWNER/ADMIN only
 */

var FilePermissionService = (function () {
  'use strict';

  var ROLE_OWNER = 'OWNER';
  var ROLE_ADMIN = 'ADMIN';
  var ROLE_FINANCE = 'FINANCE';
  var ROLE_OPERATIONS = 'OPERATIONS';
  var ROLE_CREW = 'CREW';
  var ROLE_VIEWER = 'VIEWER';

  var ENTITY_TYPES = ['CLIENT', 'BOOKING', 'DEPLOYMENT', 'EXPENSE', 'PURCHASE'];

  var WRITE_BY_ROLE = {};
  WRITE_BY_ROLE[ROLE_OWNER] = ENTITY_TYPES.slice(0);
  WRITE_BY_ROLE[ROLE_ADMIN] = ENTITY_TYPES.slice(0);
  WRITE_BY_ROLE[ROLE_OPERATIONS] = ['CLIENT', 'BOOKING', 'DEPLOYMENT', 'PURCHASE'];
  WRITE_BY_ROLE[ROLE_FINANCE] = ['EXPENSE', 'PURCHASE'];
  WRITE_BY_ROLE[ROLE_CREW] = [];
  WRITE_BY_ROLE[ROLE_VIEWER] = [];

  function isEntityType(entityType) {
    return ENTITY_TYPES.indexOf(entityType) !== -1;
  }

  function canUpload(actor, entityType) {
    if (!actor || !isEntityType(entityType)) {
      return false;
    }
    if (!actor.role) {
      // Temporary boundary (docs/SECURITY_MODEL.md 2.1): the Users sheet
      // has not landed, so no role matrix is enforced. Every session
      // actor is allowed - authority will land with the auth gate.
      return true;
    }
    var allowed = WRITE_BY_ROLE[actor.role] || [];
    return allowed.indexOf(entityType) !== -1;
  }

  function canTrash(actor) {
    if (!actor) {
      return false;
    }
    if (!actor.role) {
      // Temporary boundary (docs/SECURITY_MODEL.md 2.1) - see canUpload.
      return true;
    }
    return actor.role === ROLE_OWNER || actor.role === ROLE_ADMIN;
  }

  function canRead(actor, entityType) {
    if (!actor || !isEntityType(entityType)) {
      return false;
    }
    return true;
  }

  /**
   * Row-level scoping for CREW: deployment files are only reachable when
   * the actor is the assigned crew member (via their Crew email).
   * Non-CREW roles pass through; VIEWER passes through (view-only elsewhere).
   */
  function resolveCrewMemberIdByEmail(email) {
    if (!email) {
      return null;
    }
    var records = RepositoryService.findByField(CrewRepository.SHEET_CREW, 'email', String(email).trim().toLowerCase());
    if (records.length === 0) {
      records = RepositoryService.findByField(CrewRepository.SHEET_CREW, 'email', String(email).trim());
    }
    return records.length > 0 ? records[0].crew_member_id : null;
  }

  function isAssignedToDeployment(crewMemberId, deploymentId) {
    var rows = CrewRepository.listAssignmentsByDeployment(deploymentId);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].crewMemberId) === String(crewMemberId)) {
        return true;
      }
    }
    return false;
  }

  function canManageDeployment(actor, deploymentId) {
    if (!actor || !deploymentId) {
      return false;
    }
    if (actor.role === 'CREW') {
      if (!actor.userId) {
        return false;
      }
      var crewMemberId = resolveCrewMemberIdByEmail(actor.userId);
      if (!crewMemberId) {
        return false;
      }
      return isAssignedToDeployment(crewMemberId, deploymentId);
    }
    return true;
  }

  function assertCanUpload(actor, entityType) {
    if (!canUpload(actor, entityType)) {
      throw ErrorService.create(
        ErrorService.CODES.FILE_PERMISSION_DENIED,
        'Your role is not allowed to upload files for this record type.',
        null,
        ErrorService.CATEGORY_PERMISSION
      );
    }
  }

  function assertCanTrash(actor) {
    if (!canTrash(actor)) {
      throw ErrorService.create(
        ErrorService.CODES.FILE_PERMISSION_DENIED,
        'Only the owner and administrators can trash files.',
        null,
        ErrorService.CATEGORY_PERMISSION
      );
    }
  }

  return {
    ENTITY_TYPES: ENTITY_TYPES.slice(0),
    canUpload: canUpload,
    canTrash: canTrash,
    canRead: canRead,
    canManageDeployment: canManageDeployment,
    assertCanUpload: assertCanUpload,
    assertCanTrash: assertCanTrash
  };
})();
