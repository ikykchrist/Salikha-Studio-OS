/**
 * InventoryPermissionService.gs
 * Capability checks for the Inventory module.
 *
 * Posture (docs/SECURITY_MODEL.md §2.1): full role-based authorization
 * arrives with the Users sheet in a future sprint; until then this
 * service exposes the intended matrix and the actor is resolved from
 * the session (temporary boundary, exactly like FilePermissionService
 * and ReportPermissionService).
 *
 * Matrix (docs/ROLE_PERMISSIONS.md §2 - Inventory row):
 *   OWNER/ADMIN/OPERATIONS : create, edit, deactivate, stock movements
 *   FINANCE  : read-only
 *   CREW     : read-only
 *   VIEWER   : read-only
 */

var InventoryPermissionService = (function () {
  'use strict';

  var ROLE_OWNER = 'OWNER';
  var ROLE_ADMIN = 'ADMIN';
  var ROLE_FINANCE = 'FINANCE';
  var ROLE_OPERATIONS = 'OPERATIONS';
  var ROLE_CREW = 'CREW';
  var ROLE_VIEWER = 'VIEWER';

  var WRITE_ROLES = [ROLE_OWNER, ROLE_ADMIN, ROLE_OPERATIONS];

  function canWrite(actor) {
    if (!actor) {
      return false;
    }
    if (!actor.role) {
      // Temporary boundary (docs/SECURITY_MODEL.md 2.1): the Users sheet
      // has not landed, so no role matrix is enforced. Every session
      // actor is allowed - authority will land with the auth gate.
      return true;
    }
    return WRITE_ROLES.indexOf(actor.role) !== -1;
  }

  function canRead(actor) {
    if (!actor) {
      return false;
    }
    return true;
  }

  function assertCanWrite(actor) {
    if (!canWrite(actor)) {
      throw ErrorService.create(
        ErrorService.CODES.PERMISSION_DENIED,
        'Your role is not allowed to change inventory records.',
        null,
        ErrorService.CATEGORY_PERMISSION
      );
    }
  }

  function assertCanRead(actor) {
    if (!canRead(actor)) {
      throw ErrorService.create(
        ErrorService.CODES.PERMISSION_DENIED,
        'Your role is not allowed to view inventory records.',
        null,
        ErrorService.CATEGORY_PERMISSION
      );
    }
  }

  return {
    canWrite: canWrite,
    canRead: canRead,
    assertCanWrite: assertCanWrite,
    assertCanRead: assertCanRead,
    WRITE_ROLES: WRITE_ROLES.slice(0)
  };
})();