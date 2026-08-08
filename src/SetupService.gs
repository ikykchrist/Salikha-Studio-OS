/**
 * SetupService.gs
 * Sprint 0 initialization status and environment verification.
 *
 * This service does NOT create spreadsheet sheets (Sprint 1 owns sheet
 * initialization). It only verifies configuration, timezone, version,
 * and that the required Sprint 0 source modules exist.
 */

var SetupService = (function () {
  'use strict';

  var REQUIRED_MODULES = [
    'Config',
    'ResponseService',
    'ErrorService',
    'LoggerService',
    'ValidationService',
    'IdService',
    'DateService',
    'SetupService',
    'HealthService'
  ];

  function moduleExists(moduleName) {
    try {
      var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
      return typeof scope[moduleName] === 'object' && scope[moduleName] !== null;
    } catch (e) {
      return false;
    }
  }

  function missingModules() {
    var missing = [];
    for (var i = 0; i < REQUIRED_MODULES.length; i++) {
      if (!moduleExists(REQUIRED_MODULES[i])) {
        missing.push(REQUIRED_MODULES[i]);
      }
    }
    return missing;
  }

  function verifyRuntime() {
    var engine;
    try {
      engine = (typeof V8Runtime !== 'undefined') ? 'V8' : 'unknown';
    } catch (e) {
      engine = 'unknown';
    }
    return {
      runtime: engine,
      server: 'Apps Script'
    };
  }

  /**
   * Returns a safe initialization status snapshot.
   * No secrets, no sheet IDs, no real configuration values.
   */
  function getSetupStatus() {
    var missing = missingModules();
    return {
      appName: Config.getAppName(),
      appVersion: Config.getAppVersion(),
      environment: Config.getAppEnv(),
      timezone: Config.getBusinessTimezone_(),
      currency: Config.getBusinessCurrency_(),
      configReady: Config.isConfigReady(),
      configRequiredKeys: Config.PROPERTY_KEYS.slice(0),
      runtime: verifyRuntime(),
      modulesLoaded: missing.length === 0,
      missingModules: missing,
      initialized: true
    };
  }

  return {
    getSetupStatus: getSetupStatus,
    verifyRuntime: verifyRuntime,
    missingModules: missingModules
  };
})();

