/**
 * HealthService.gs
 * Lightweight system-health endpoint callable from the frontend.
 *
 * Returns only non-sensitive values. Secret IDs (spreadsheet, folder,
 * calendar) are never included.
 */

var HealthService = (function () {
  'use strict';

  /**
   * Public health payload for the SPA connection check.
   * Includes integration STATUSES only - never IDs or resource names.
   */
  function getSystemHealth() {
    LoggerService.info('HealthService.getSystemHealth', 'Health check requested.');
    var publicConfig = Config.getPublicConfig();
    var integrations = IntegrationService.getIntegrationSummary();
    return {
      appName: publicConfig.appName,
      appVersion: publicConfig.appVersion,
      environment: publicConfig.appEnv,
      timezone: publicConfig.businessTimezone,
      currency: publicConfig.businessCurrency,
      serverTimestamp: DateService.nowIso(),
      status: 'ok',
      configReady: publicConfig.configReady,
      databaseStatus: integrations.spreadsheet === IntegrationService.STATUS_CONNECTED ? 'READY' : 'NOT_READY',
      integrations: {
        spreadsheet: integrations.spreadsheet,
        drive: integrations.drive,
        calendar: integrations.calendar,
        overall: integrations.overall
      }
    };
  }

  return {
    getSystemHealth: getSystemHealth
  };
})();
