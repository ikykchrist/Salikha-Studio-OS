/**
 * Code.gs
 * Web app entry point and router for Salikha Studio OS.
 *
 * Sprint 0 responsibilities:
 *   - Serve the single-page application shell via doGet().
 *   - Provide the HTML include helper for the HtmlService templates.
 *   - Accept an optional ?page= route parameter (client-side routing).
 *
 * No business logic lives here. Future authorization gates attach in
 * later sprints (see docs/SECURITY_MODEL.md).
 */

/**
 * Web app entry point.
 * @param {Object} e The event parameter object.
 * @return {HtmlOutput} The application shell.
 */
function doGet(e) {
  LoggerService.info('doGet', 'Application shell requested.', {
    route: e && e.parameter && e.parameter.page ? String(e.parameter.page) : null
  });

  var template = HtmlService.createTemplateFromFile('index');
  template.initialRoute = sanitizeRoute(e && e.parameter && e.parameter.page
    ? String(e.parameter.page)
    : 'dashboard');

  return template.evaluate()
    .setTitle(Config.getAppName())
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Validates an optional route parameter. Returns the value when it
 * matches the allowed page-id pattern, otherwise the dashboard route.
 * @param {string} value Raw route value from the request.
 * @return {string} A safe page id.
 */
function sanitizeRoute(value) {
  return /^[a-z0-9-]{1,40}$/.test(value || '') ? value : 'dashboard';
}

/**
 * Includes an HtmlService file's content into a template.
 * @param {string} filename Template file name without extension.
 * @return {string} The file's rendered content.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * System health endpoint. Safe, no secrets.
 * @return {Object} Structured health payload.
 */
function getSystemHealth() {
  return ResponseService.success(HealthService.getSystemHealth(), 'System health retrieved.');
}
