/**
 * Config.gs
 * Central configuration access for Salikha Studio OS.
 *
 * Reads environment-specific values from Apps Script Properties Service
 * (script properties). No real IDs are hardcoded here.
 *
 * Integration accessors follow a private convention (trailing `_`):
 * they trim values, reject placeholders and empty strings, and throw a
 * user-friendly CONFIGURATION_ERROR. They are server-only; values are
 * never returned to the frontend.
 */

var Config = (function () {
  'use strict';

  var APP_NAME = 'Salikha Studio OS';
  var APP_VERSION = '0.8.0-dashboard-reports';
  var APP_ENV = 'development';
  var BUSINESS_TIMEZONE = 'Asia/Manila';
  var BUSINESS_CURRENCY = 'PHP';

  var PROPERTY_KEYS = [
    'APP_ENV',
    'SPREADSHEET_ID',
    'ROOT_DRIVE_FOLDER_ID',
    'CALENDAR_ID',
    'BUSINESS_TIMEZONE',
    'BUSINESS_CURRENCY'
  ];

  /**
   * Values that are never valid resource IDs.
   */
  var PLACEHOLDER_PATTERN = /^(REPLACE|YOUR|XXXX|TODO|NONE|NOT[_ ]?SET|PLACEHOLDER|PENDING|CHANGE[_ ]?ME|FILL)/i;

  function getPropertyStore() {
    return PropertiesService.getScriptProperties();
  }

  /**
   * Returns a configured value with an optional default.
   */
  function get(key, defaultValue) {
    var store = getPropertyStore();
    var value = store.getProperty(key);
    if (value !== null && value !== undefined && String(value) !== '') {
      return value;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return null;
  }

  function isPlaceholderValue(value) {
    return PLACEHOLDER_PATTERN.test(String(value).trim());
  }

  /**
   * Reads a required integration property. Trims, rejects placeholders
   * and empty values, and throws a clear CONFIGURATION_ERROR.
   * Never logs the value.
   * @param {string} key Property name.
   * @param {string} friendlyLabel Label used in the error message.
   * @return {string} The trimmed value.
   */
  function requiredProperty_(key, friendlyLabel) {
    var raw = get(key);
    if (raw === null) {
      throw ErrorService.create(
        ErrorService.CODES.CONFIGURATION_ERROR,
        friendlyLabel + ' is not configured. Add ' + key + ' in Apps Script Script Properties.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    var trimmed = String(raw).trim();
    if (trimmed === '' || isPlaceholderValue(trimmed)) {
      throw ErrorService.create(
        ErrorService.CODES.CONFIGURATION_ERROR,
        friendlyLabel + ' is not configured. Add ' + key + ' in Apps Script Script Properties.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    return trimmed;
  }

  /**
   * Presence check for a single property: booleans only, never values.
   */
  function hasProperty(key) {
    var raw = get(key);
    if (raw === null) {
      return false;
    }
    var trimmed = String(raw).trim();
    return trimmed !== '' && !isPlaceholderValue(trimmed);
  }

  /**
   * Presence check: booleans only, never property values.
   */
  function hasRequiredIntegrationProperties_() {
    return hasProperty('SPREADSHEET_ID') &&
           hasProperty('ROOT_DRIVE_FOLDER_ID') &&
           hasProperty('CALENDAR_ID');
  }

  function getAppName() {
    return get('APP_NAME', APP_NAME);
  }

  function getAppVersion() {
    return APP_VERSION;
  }

  function getAppEnv() {
    return get('APP_ENV', APP_ENV);
  }

  /**
   * Private accessors (trailing `_`): server-only, safe.
   */
  function getSpreadsheetId_() {
    return requiredProperty_('SPREADSHEET_ID', 'The business database spreadsheet');
  }

  function getRootDriveFolderId_() {
    return requiredProperty_('ROOT_DRIVE_FOLDER_ID', 'The root Drive folder');
  }

  function getCalendarId_() {
    return requiredProperty_('CALENDAR_ID', 'The business calendar');
  }

  function getBusinessTimezone_() {
    var value = get('BUSINESS_TIMEZONE', BUSINESS_TIMEZONE);
    var trimmed = String(value).trim();
    return trimmed === '' ? BUSINESS_TIMEZONE : trimmed;
  }

  function getBusinessCurrency_() {
    var value = get('BUSINESS_CURRENCY', BUSINESS_CURRENCY);
    var trimmed = String(value).trim();
    return trimmed === '' ? BUSINESS_CURRENCY : trimmed;
  }

  /**
   * True when all required integration properties are configured.
   * Presence only - connectivity is verified separately.
   */
  function isConfigReady() {
    return hasRequiredIntegrationProperties_();
  }

  /**
   * Non-sensitive subset safe to expose to the frontend.
   * Never includes SPREADSHEET_ID, folder IDs, or calendar IDs.
   */
  function getPublicConfig() {
    return {
      appName: getAppName(),
      appVersion: getAppVersion(),
      appEnv: getAppEnv(),
      businessTimezone: getBusinessTimezone_(),
      businessCurrency: getBusinessCurrency_(),
      configReady: isConfigReady()
    };
  }

  return {
    get: get,
    hasProperty: hasProperty,
    getAppName: getAppName,
    getAppVersion: getAppVersion,
    getAppEnv: getAppEnv,
    getSpreadsheetId_: getSpreadsheetId_,
    getRootDriveFolderId_: getRootDriveFolderId_,
    getCalendarId_: getCalendarId_,
    getBusinessTimezone_: getBusinessTimezone_,
    getBusinessCurrency_: getBusinessCurrency_,
    hasRequiredIntegrationProperties_: hasRequiredIntegrationProperties_,
    isConfigReady: isConfigReady,
    getPublicConfig: getPublicConfig,
    PROPERTY_KEYS: PROPERTY_KEYS
  };
})();

