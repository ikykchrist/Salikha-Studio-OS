/**
 * IdService.gs
 * Future-safe immutable ID generation.
 *
 * Format: PREFIX-YYYY-XXXXXXXX where PREFIX is an uppercase business
 * prefix (e.g., CLI, BKG, TXN, DEP, INV, EQP) and XXXXXXXX is a random
 * base-36 component. IDs are never spreadsheet row numbers.
 *
 * Examples:
 *   CLI-2026-8F3K2A9Q
 *   BKG-2026-7M4P1C2X
 *   TXN-2026-5R9J8D3W
 */

var IdService = (function () {
  'use strict';

  var PREFIX_PATTERN = /^[A-Z]{2,5}$/;

  var DEFAULT_PREFIXES = [
    'CLI', 'LED', 'NTE', 'INT', 'BKG', 'PAY', 'TXN', 'EXP', 'ITM', 'BCH', 'MV',
    'EQP', 'EQM', 'DEP', 'DPM', 'DPC', 'DPI', 'SUP', 'PCH',
    'PTC', 'PTR', 'CM', 'CSA', 'CPY', 'TSK', 'FL', 'SET', 'USR', 'ADD',
    'RFN', 'BKI', 'ALC', 'STH', 'SCH', 'BKC', 'PCM'
  ];

  function isSafePrefix(prefix) {
    return typeof prefix === 'string' && PREFIX_PATTERN.test(prefix);
  }

  /**
   * Random base-36 component: 8 characters.
   */
  function randomComponent(length) {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < length; i++) {
      var index = Math.floor(Math.random() * alphabet.length);
      out += alphabet.charAt(index);
    }
    return out;
  }

  function currentYear() {
    var now = DateService.now();
    return now.getFullYear().toString();
  }

  /**
   * Generates an ID: PREFIX-YYYY-XXXXXXXX.
   */
  function generateId(prefix) {
    if (!isSafePrefix(prefix)) {
      var err = ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'Invalid ID prefix: ' + prefix + '. Prefix must be 2-5 uppercase letters.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
      throw err;
    }
    return prefix + '-' + currentYear() + '-' + randomComponent(8);
  }

  /**
   * Generates a raw random component without prefix/year.
   * Useful for relationship tokens or idempotency keys.
   */
  function generateRaw() {
    return randomComponent(12);
  }

  /**
   * Validates an existing ID format without checking existence.
   */
  function isValidId(value, prefix) {
    if (typeof value !== 'string') {
      return false;
    }
    if (prefix && !isSafePrefix(prefix)) {
      return false;
    }
    if (prefix) {
      var pattern = new RegExp('^' + prefix + '-\\d{4}-[A-Z2-9]{8}$');
      return pattern.test(value);
    }
    return /^[A-Z]{2,5}-\d{4}-[A-Z2-9]{8}$/.test(value);
  }

  return {
    generateId: generateId,
    generateRaw: generateRaw,
    isValidId: isValidId,
    isSafePrefix: isSafePrefix,
    DEFAULT_PREFIXES: DEFAULT_PREFIXES
  };
})();

