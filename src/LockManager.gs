/**
 * LockManager.gs
 * Safe wrapper around Apps Script Lock Service for critical financial
 * writes. Locks are always released in finally blocks.
 *
 * Note: named LockManager (not LockService) to avoid shadowing the
 * built-in Apps Script LockService global.
 */

var LockManager = (function () {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 15000;

  /**
   * True when this execution already holds the script lock. Apps Script
   * locks are not reentrant, so nested withLock calls must reuse the
   * held lock instead of trying to acquire it again.
   */
  var lockHeld = false;

  /**
   * Runs an operation under a script lock.
   *
   * @param {Function} operation Synchronous work to run under the lock.
   * @param {string} lockKey Short stable key identifying the operation.
   * @param {number} timeoutMs Timeout in milliseconds.
   * @return {*} The operation result.
   */
  function withLock(operation, lockKey, timeoutMs) {
    if (lockHeld) {
      return operation();
    }
    var lock = LockService.getScriptLock();
    var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
    var acquired = false;
    try {
      acquired = lock.tryLock(timeout);
      if (!acquired) {
        throw ErrorService.create(
          ErrorService.CODES.LOCK_TIMEOUT,
          'The system is busy with another financial operation. Please try again in a moment.',
          null,
          ErrorService.CATEGORY_CONFLICT
        );
      }
      lockHeld = true;
      return operation();
    } finally {
      if (acquired) {
        lockHeld = false;
        try {
          lock.releaseLock();
        } catch (ignored) {
          /* lock release must never mask the original outcome */
        }
      }
    }
  }

  /**
   * Runs an operation with the default timeout.
   */
  function run(operation) {
    return withLock(operation, 'salikha-finance', DEFAULT_TIMEOUT_MS);
  }

  return {
    withLock: withLock,
    run: run,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS
  };
})();
