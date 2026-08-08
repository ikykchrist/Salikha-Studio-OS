/**
 * LoggerService.gs
 * Structured logging for Salikha Studio OS.
 *
 * Levels: DEBUG, INFO, WARN, ERROR.
 * Logs are written to the Apps Script execution log (console) with a
 * consistent structure. Secrets and full financial payloads are never
 * logged. A future audit-logging integration point is reserved.
 */

var LoggerService = (function () {
  'use strict';

  var LEVEL_DEBUG = 'DEBUG';
  var LEVEL_INFO = 'INFO';
  var LEVEL_WARN = 'WARN';
  var LEVEL_ERROR = 'ERROR';

  var MIN_LEVEL = LEVEL_INFO;

  var LEVEL_ORDER = {};
  LEVEL_ORDER[LEVEL_DEBUG] = 10;
  LEVEL_ORDER[LEVEL_INFO] = 20;
  LEVEL_ORDER[LEVEL_WARN] = 30;
  LEVEL_ORDER[LEVEL_ERROR] = 40;

  /**
   * Removes values that are never safe to log.
   */
  function sanitizeMetadata(meta) {
    if (meta === null || meta === undefined) {
      return {};
    }
    var out = {};
    var keys = Object.keys(meta);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = meta[key];
      if (key === 'apiKey' || key === 'password' || key === 'token' ||
          key === 'secret' || key === 'accessToken') {
        continue;
      }
      if (typeof value === 'string' && value.length > 2000) {
        out[key] = value.substring(0, 2000) + '...';
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function write(level, context, message, meta) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) {
      return;
    }
    var entry = {
      timestamp: DateService.nowIso(),
      level: level,
      context: context || 'app',
      message: message || ''
    };
    var safe = sanitizeMetadata(meta);
    var safeKeys = Object.keys(safe);
    for (var i = 0; i < safeKeys.length; i++) {
      entry[safeKeys[i]] = safe[safeKeys[i]];
    }
    try {
      console.log(JSON.stringify(entry));
    } catch (e) {
      try {
        Logger.log('LOG_FAIL ' + level + ' ' + (context || ''));
      } catch (ignored) {
        /* logging must never crash the caller */
      }
    }
    // Future extension point: push critical entries to an audit log sink.
  }

  function debug(context, message, meta) {
    write(LEVEL_DEBUG, context, message, meta);
  }

  function info(context, message, meta) {
    write(LEVEL_INFO, context, message, meta);
  }

  function warn(context, message, meta) {
    write(LEVEL_WARN, context, message, meta);
  }

  function error(context, message, meta) {
    write(LEVEL_ERROR, context, message, meta);
  }

  return {
    debug: debug,
    info: info,
    warn: warn,
    error: error,
    sanitizeMetadata: sanitizeMetadata,
    LEVELS: {
      DEBUG: LEVEL_DEBUG,
      INFO: LEVEL_INFO,
      WARN: LEVEL_WARN,
      ERROR: LEVEL_ERROR
    }
  };
})();
