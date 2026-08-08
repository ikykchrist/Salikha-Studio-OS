/**
 * SetupPermissionService.gs
 * Authorization gate for first-run system initialization.
 *
 * Posture: full role-based authorization is not implemented yet (the
 * Users sheet arrives in a future sprint). Mirroring the other
 * permission gates (AutomationPermissionService, FilePermissionService,
 * ReportPermissionService), this gate is intentionally small and marked
 * as a temporary boundary - see docs/SECURITY_MODEL.md Sec 2.1.
 *
 * When an actor carries a resolved role, it IS enforced today:
 * only OWNER/ADMIN may initialize or repair infrastructure. Actors
 * without a role (the current session-shaped boundary) remain allowed
 * so first-run setup is not dead-locked before the Users sheet exists.
 * The future role matrix lives here: OWNER/ADMIN manage system setup
 * (docs/ROLE_PERMISSIONS.md Settings row).
 */

var SetupPermissionService = (function () {
  'use strict';

  var SETUP_ROLES = ['OWNER', 'ADMIN'];

  /**
   * Returns the acting user (temporary actor; audit purposes only).
   */
  function getActor() {
    return AuditService.getActor();
  }

  /**
   * Setup gate.
   * - No actor context: allowed under the documented temporary boundary.
   * - Actor with a resolved role: OWNER/ADMIN enforced, everyone else
   *   denied with SETUP_PERMISSION_DENIED.
   * @param {Object} actor Optional request actor { userId, role }.
   * @return {boolean} True when setup access is granted.
   */
  function requireSetupAccess(actor) {
    if (!actor) {
      return true;
    }
    if (actor.role && SETUP_ROLES.indexOf(actor.role) === -1) {
      throw ErrorService.create(
        ErrorService.CODES.SETUP_PERMISSION_DENIED,
        'Only the system owner or an authorized setup role can initialize the system.',
        null,
        ErrorService.CATEGORY_PERMISSION
      );
    }
    return true;
  }

  return {
    SETUP_ROLES: SETUP_ROLES.slice(0),
    getActor: getActor,
    requireSetupAccess: requireSetupAccess
  };
})();