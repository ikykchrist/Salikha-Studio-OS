/**
 * ValidationService.gs
 * General-purpose validation utilities.
 *
 * Module-specific schemas arrive in future sprints. These helpers cover
 * the common primitives: required values, strings, numbers, amounts,
 * dates, enums, emails, trimming, and object checks.
 *
 * All helpers return a validation result object: { valid, message }.
 */

var ValidationService = (function () {
  'use strict';

  function fail(message) {
    return { valid: false, message: message || 'Invalid value.' };
  }

  function pass() {
    return { valid: true, message: null };
  }

  function isRequired(value, fieldName) {
    if (value === null || value === undefined) {
      return fail(fieldName + ' is required.');
    }
    if (typeof value === 'string' && value.trim() === '') {
      return fail(fieldName + ' is required.');
    }
    return pass();
  }

  function isString(value, fieldName, maxLength) {
    if (typeof value !== 'string') {
      return fail(fieldName + ' must be text.');
    }
    if (maxLength && value.length > maxLength) {
      return fail(fieldName + ' must not exceed ' + maxLength + ' characters.');
    }
    return pass();
  }

  function isNonEmptyString(value, fieldName, maxLength) {
    var required = isRequired(value, fieldName);
    if (!required.valid) {
      return required;
    }
    if (typeof value !== 'string') {
      return fail(fieldName + ' must be text.');
    }
    if (value.trim() === '') {
      return fail(fieldName + ' cannot be blank.');
    }
    if (maxLength && value.length > maxLength) {
      return fail(fieldName + ' must not exceed ' + maxLength + ' characters.');
    }
    return pass();
  }

  function isNumber(value, fieldName) {
    if (typeof value === 'number' && isFinite(value)) {
      return pass();
    }
    if (typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))) {
      return pass();
    }
    return fail(fieldName + ' must be a number.');
  }

  /**
   * Amount must be greater than or equal to zero.
   * Use for discounts, opening balances, and other values where zero is valid.
   */
  function isNonNegativeAmount(value, fieldName) {
    var numberCheck = isNumber(value, fieldName);
    if (!numberCheck.valid) {
      return numberCheck;
    }
    var numeric = typeof value === 'number' ? value : Number(value);
    if (numeric < 0) {
      return fail(fieldName + ' cannot be negative.');
    }
    return pass();
  }

  /**
   * Amount must be strictly greater than zero.
   * Use for payments, purchase quantities, and positive charges.
   */
  function isPositiveAmount(value, fieldName) {
    var numberCheck = isNumber(value, fieldName);
    if (!numberCheck.valid) {
      return numberCheck;
    }
    var numeric = typeof value === 'number' ? value : Number(value);
    if (numeric <= 0) {
      return fail(fieldName + ' must be greater than zero.');
    }
    return pass();
  }

  function isPositiveInt(value, fieldName) {
    var numberCheck = isNumber(value, fieldName);
    if (!numberCheck.valid) {
      return numberCheck;
    }
    var numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(numeric) || numeric < 1) {
      return fail(fieldName + ' must be a positive whole number.');
    }
    return pass();
  }

  function isDate(value, fieldName) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return pass();
    }
    if (typeof value === 'string' && value.trim() !== '') {
      var parsed = DateService.normalizeInputDate(value);
      if (parsed) {
        return pass();
      }
    }
    return fail(fieldName + ' must be a valid date.');
  }

  function isEnum(value, allowedValues, fieldName) {
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
      return fail(fieldName + ' has no allowed values configured.');
    }
    if (allowedValues.indexOf(value) === -1) {
      return fail(fieldName + ' must be one of: ' + allowedValues.join(', ') + '.');
    }
    return pass();
  }

  function isEmail(value, fieldName) {
    var required = isRequired(value, fieldName);
    if (!required.valid) {
      return required;
    }
    if (typeof value !== 'string') {
      return fail(fieldName + ' must be an email address.');
    }
    var trimmed = value.trim();
    var pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!pattern.test(trimmed)) {
      return fail(fieldName + ' must be a valid email address.');
    }
    return pass();
  }

  function trimSafe(value) {
    if (typeof value !== 'string') {
      return value;
    }
    return value.trim();
  }

  function isObject(value, fieldName) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail(fieldName + ' must be an object.');
    }
    return pass();
  }

  function isArray(value, fieldName) {
    if (!Array.isArray(value)) {
      return fail(fieldName + ' must be a list.');
    }
    return pass();
  }

  /**
   * Runs a list of validators; returns the first failure or passes.
   */
  function all(fieldName, value, validators) {
    for (var i = 0; i < validators.length; i++) {
      var result = validators[i](value, fieldName);
      if (!result.valid) {
        return result;
      }
    }
    return pass();
  }

  return {
    isRequired: isRequired,
    isString: isString,
    isNonEmptyString: isNonEmptyString,
    isNumber: isNumber,
    isNonNegativeAmount: isNonNegativeAmount,
    isPositiveAmount: isPositiveAmount,
    isPositiveInt: isPositiveInt,
    isDate: isDate,
    isEnum: isEnum,
    isEmail: isEmail,
    trimSafe: trimSafe,
    isObject: isObject,
    isArray: isArray,
    all: all
  };
})();
