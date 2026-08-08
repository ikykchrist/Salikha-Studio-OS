/**
 * AutomationTriggerService.gs
 * Idempotent install / remove / status of the automation triggers
 * (docs/PRODUCT_REQUIREMENTS.md §22, docs/BUSINESS_WORKFLOWS.md WF-14).
 *
 * Scheduled jobs:
 *   automationDailyBackup           daily 03:00  - local + CSV backup
 *   automationBackupVerification    Sat   05:00  - integrity check
 *   automationWeeklyOffsite         Sun   04:00  - weekly full + off-site
 *   automationWeeklyDigest          Mon   06:00  - weekly digest email
 *
 * Install is idempotent: it removes existing triggers with the same
 * handler before re-creating, so schedules never duplicate.
 */

var AutomationTriggerService = (function () {
  'use strict';

  var TRIGGER_DEFS = [
    { handler: 'automationDailyBackup', label: 'Daily backup', kind: 'daily', hour: 3, minute: 0 },
    { handler: 'automationBackupVerification', label: 'Backup verification', kind: 'weekday', weekday: 'SATURDAY', hour: 5, minute: 0 },
    { handler: 'automationWeeklyOffsite', label: 'Weekly off-site backup', kind: 'weekday', weekday: 'SUNDAY', hour: 4, minute: 0 },
    { handler: 'automationWeeklyDigest', label: 'Weekly digest', kind: 'weekday', weekday: 'MONDAY', hour: 6, minute: 0 }
  ];

  function ownedHandlerNames() {
    var names = [];
    for (var i = 0; i < TRIGGER_DEFS.length; i++) {
      names.push(TRIGGER_DEFS[i].handler);
    }
    return names;
  }

  /**
   * All existing project triggers whose handler this service owns.
   */
  function ownedTriggers() {
    var all;
    try {
      all = ScriptApp.getProjectTriggers();
    } catch (err) {
      return [];
    }
    var owned = [];
    var names = ownedHandlerNames();
    for (var i = 0; i < all.length; i++) {
      var handler = '';
      try {
        handler = all[i].getHandlerFunction();
      } catch (ignored) {
        handler = '';
      }
      if (names.indexOf(handler) >= 0) {
        owned.push(all[i]);
      }
    }
    return owned;
  }

  function removeAllTriggers() {
    var owned = ownedTriggers();
    for (var i = 0; i < owned.length; i++) {
      try {
        owned[i].deleteTrigger();
      } catch (ignored) {
        LoggerService.warn('AutomationTriggerService.removeAllTriggers', 'A trigger could not be deleted', { handler: '' });
      }
    }
    return owned.length;
  }

  function createOne(def) {
    var builder = ScriptApp.newTrigger(def.handler).timeBased().atHour(def.hour);
    if (def.minute) {
      builder.nearMinute(def.minute);
    }
    if (def.kind === 'weekday') {
      builder.onWeekDay(ScriptApp.WeekDay[def.weekday]);
    } else {
      builder.everyDays(1);
    }
    var trigger = builder.create();
    var id = '';
    try {
      id = trigger.getUniqueId();
    } catch (err) {
      id = '';
    }
    return { handler: def.handler, uid: id, scheduled: def.label };
  }

  /**
   * Installs all scheduled triggers (idempotent). Returns the list of
   * installed trigger summaries.
   */
  function installTriggers() {
    removeAllTriggers();
    var installed = [];
    for (var i = 0; i < TRIGGER_DEFS.length; i++) {
      installed.push(createOne(TRIGGER_DEFS[i]));
    }
    return installed;
  }

  /**
   * Removes all scheduled triggers. Returns the number removed.
   */
  function uninstallTriggers() {
    return removeAllTriggers();
  }

  /**
   * Current automation state for the UI.
   */
  function getStatus() {
    var owned = ownedTriggers();
    var summaries = [];
    for (var i = 0; i < owned.length; i++) {
      var handler = '';
      try {
        handler = owned[i].getHandlerFunction();
      } catch (ignored) {
        handler = '';
      }
      summaries.push({ handler: handler, uid: owned[i].getUniqueId ? owned[i].getUniqueId() : '' });
    }
    summaries.sort(function (a, b) {
      return String(a.handler).localeCompare(String(b.handler));
    });
    return {
      enabled: summaries.length > 0,
      count: summaries.length,
      triggers: summaries,
      definitions: TRIGGER_DEFS.map(function (d) {
        return { handler: d.handler, label: d.label, kind: d.kind, hour: d.hour, minute: d.minute, weekday: d.weekday || null };
      })
    };
  }

  return {
    TRIGGER_DEFS: TRIGGER_DEFS.slice(0),
    ownedTriggers: ownedTriggers,
    removeAllTriggers: removeAllTriggers,
    installTriggers: installTriggers,
    uninstallTriggers: uninstallTriggers,
    getStatus: getStatus
  };
})();