/**
 * AutomationPermissionService.gs
 * Authorization gate for automation management (Sprint 8).
 *
 * Posture: full role-based authorization is not implemented yet (the
 * Users sheet arrives in a future sprint). Like ReportPermissionService,
 * this gate is deliberately small and clearly marked as a temporary
 * boundary - see docs/SECURITY_MODEL.md Sec 2.1. When auth lands, the
 * role matrix lives here: OWNER/ADMIN manage automation (docs/
 * ROLE_PERMISSIONS.md Settings row).
 */

var AutomationPermissionService = (function () {
  'use strict';

  var MANAGE_ROLES = ['OWNER', 'ADMIN'];

  /**
   * Returns the acting user (temporary actor; audit purposes only).
   */
  function getActor() {
    return AuditService.getActor();
  }

  /**
   * Temporary boundary: records intent; no denial is enforced yet.
   * Future implementation: requireManagers(actor.role) throwing
   * PERMISSION_DENIED when the role is not in MANAGE_ROLES.
   */
  function requireManageAccess() {
    return true;
  }

  return {
    MANAGE_ROLES: MANAGE_ROLES.slice(0),
    getActor: getActor,
    requireManageAccess: requireManageAccess
  };
})();