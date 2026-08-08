/**
 * SetupController.gs
 * Server entry points for the first-run initialization flow.
 *
 * Exposed to the browser via google.script.run:
 *   - getSetupStatus()            read-only snapshot (never mutates)
 *   - initializeSalikhaStudioOS() full idempotent initialization run
 */

/**
 * Read-only setup status for the boot gate and the landing page.
 * @return {Object} Response envelope with the setup payload.
 */
function getSetupStatus() {
  return ErrorService.wrap(function () {
    var payload = SystemInitializationService.getSetupStatus();
    return ResponseService.success(payload, payload.message);
  })();
}

/**
 * Full system initialization run (idempotent, owner-gated per the
 * documented permission posture).
 * @return {Object} Response envelope with the setup payload.
 */
function initializeSalikhaStudioOS() {
  return ErrorService.wrap(function () {
    var payload = SystemInitializationService.runInitialization();
    return ResponseService.success(payload, payload.message);
  })();
}