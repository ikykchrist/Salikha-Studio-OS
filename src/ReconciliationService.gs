/**
 * ReconciliationService.gs
 * Daily cash reconciliation foundation (Sprint 1 scope).
 *
 * Expected closing is computed server-side from the ledger. Actual
 * closing is entered by the user. Differences never auto-adjust the
 * ledger - adjustment posting is a separate controlled action (future).
 */

var ReconciliationService = (function () {
  'use strict';

  var STATUS_DRAFT = 'DRAFT';
  var STATUS_RECONCILED = 'RECONCILED';
  var STATUS_REOPENED = 'REOPENED';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The financial database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
  }

  /**
   * Computes the expected daily figures for an account and date.
   * opening_expected is the ledger balance before the date (posted
   * transactions only, including the OPENING_BALANCE transaction).
   */
  function computeExpected(reconciliationDate, accountId) {
    var account = CashAccountService.requireActiveAccount(accountId);
    var transactions = RepositoryService.findByField(SheetSchemaService.SHEET_CASH_TRANSACTIONS, 'account_id', accountId);
    var beforeBalance = 0;
    var dayInflows = 0;
    var dayOutflows = 0;
    var dayTransfersIn = 0;
    var dayTransfersOut = 0;
    for (var i = 0; i < transactions.length; i++) {
      var tx = transactions[i];
      if (String(tx.status) === CashTransactionService.STATUS_VOIDED) {
        continue;
      }
      var isTransfer = String(tx.transaction_type) === CashTransactionService.TYPE_TRANSFER_IN ||
                       String(tx.transaction_type) === CashTransactionService.TYPE_TRANSFER_OUT;
      var dateBefore = String(tx.transaction_date) < String(reconciliationDate);
      var amount = Number(tx.amount || 0);
      var inflow = String(tx.direction) === CashTransactionService.DIRECTION_INFLOW;
      if (dateBefore) {
        if (inflow) {
          beforeBalance += amount;
        } else {
          beforeBalance -= amount;
        }
      } else if (String(tx.transaction_date) === String(reconciliationDate)) {
        if (isTransfer) {
          if (inflow) {
            dayTransfersIn += amount;
          } else {
            dayTransfersOut += amount;
          }
        } else if (inflow) {
          dayInflows += amount;
        } else {
          dayOutflows += amount;
        }
      }
    }
    var expectedClosing = beforeBalance + dayInflows - dayOutflows + dayTransfersIn - dayTransfersOut;
    return {
      openingExpected: beforeBalance,
      inflows: dayInflows,
      outflows: dayOutflows,
      transfersIn: dayTransfersIn,
      transfersOut: dayTransfersOut,
      expectedClosing: expectedClosing
    };
  }

  /**
   * Returns reconciliation data for an account and date (may be DRAFT).
   */
  function getReconciliationData(payload) {
    assertDatabase();
    var accountId = payload.accountId;
    var reconciliationDate = payload.reconciliationDate || DateService.toIsoDate(DateService.now());
    var dateCheck = ValidationService.isDate(reconciliationDate, 'Reconciliation date');
    if (!dateCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    CashAccountService.requireActiveAccount(accountId);
    var expected = computeExpected(reconciliationDate, accountId);
    var existing = findByDateAndAccount(reconciliationDate, accountId);
    return {
      accountId: accountId,
      reconciliationDate: reconciliationDate,
      expected: expected,
      existing: existing ? RepositoryService.toPublicRecord(existing) : null
    };
  }

  function findByDateAndAccount(reconciliationDate, accountId) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_DAILY_RECONCILIATIONS);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].reconciliation_date) === String(reconciliationDate) &&
          String(records[i].account_id) === String(accountId)) {
        return records[i];
      }
    }
    return null;
  }

  /**
   * Saves (and finalizes) a daily reconciliation.
   * Duplicate finalized reconciliations for the same date/account are
   * rejected; a DRAFT row for the same date/account is updated.
   */
  function saveReconciliation(payload) {
    assertDatabase();
    var accountId = payload.accountId;
    var reconciliationDate = payload.reconciliationDate;
    var dateCheck = ValidationService.isDate(reconciliationDate, 'Reconciliation date');
    if (!dateCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    CashAccountService.requireActiveAccount(accountId);
    var actualClosing = Number(payload.actualClosing);
    var actualCheck = ValidationService.isNonNegativeAmount(actualClosing, 'Actual closing balance');
    if (!actualCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, actualCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }

    return LockManager.run(function () {
      var existing = findByDateAndAccount(reconciliationDate, accountId);
      if (existing) {
        if (String(existing.status) === STATUS_RECONCILED) {
          throw ErrorService.create(
            ErrorService.CODES.RECONCILIATION_ALREADY_EXISTS,
            'A finalized reconciliation already exists for this account and date.',
            null,
            ErrorService.CATEGORY_CONFLICT
          );
        }
      }
      var expected = computeExpected(reconciliationDate, accountId);
      var difference = actualClosing - expected.expectedClosing;
      var explanation = ValidationService.trimSafe(payload.explanation);
      if (Math.abs(difference) > 0.005 && !explanation) {
        throw ErrorService.create(
          ErrorService.CODES.VALIDATION_ERROR,
          'An explanation is required when the difference is not zero.',
          null,
          ErrorService.CATEGORY_VALIDATION
        );
      }
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      if (existing) {
        RepositoryService.updateById(SheetSchemaService.SHEET_DAILY_RECONCILIATIONS, existing.reconciliation_id, {
          opening_expected: expected.openingExpected,
          inflows: expected.inflows,
          outflows: expected.outflows,
          transfers_in: expected.transfersIn,
          transfers_out: expected.transfersOut,
          expected_closing: expected.expectedClosing,
          actual_closing: actualClosing,
          difference: difference,
          explanation: explanation,
          status: STATUS_RECONCILED,
          reconciled_at: now,
          reconciled_by: actor.userId,
          updated_at: now,
          updated_by: actor.userId
        });
      } else {
        var record = {
          reconciliation_id: IdService.generateId('REC'),
          reconciliation_date: reconciliationDate,
          account_id: accountId,
          opening_expected: expected.openingExpected,
          inflows: expected.inflows,
          outflows: expected.outflows,
          transfers_in: expected.transfersIn,
          transfers_out: expected.transfersOut,
          expected_closing: expected.expectedClosing,
          actual_closing: actualClosing,
          difference: difference,
          explanation: explanation,
          status: STATUS_RECONCILED,
          reconciled_at: now,
          reconciled_by: actor.userId,
          created_at: now,
          created_by: actor.userId,
          updated_at: now,
          updated_by: actor.userId
        };
        RepositoryService.appendRecord(SheetSchemaService.SHEET_DAILY_RECONCILIATIONS, record);
      }
      AuditService.info(AuditService.ACTIONS.DAILY_RECONCILIATION_SAVED, 'DailyCashReconciliations', reconciliationDate + '-' + accountId,
        'Reconciled ' + accountId + ' for ' + reconciliationDate + '. Difference: ' + Number(difference).toFixed(2) + '.');
      return {
        reconciliationDate: reconciliationDate,
        accountId: accountId,
        expectedClosing: expected.expectedClosing,
        actualClosing: actualClosing,
        difference: difference,
        status: STATUS_RECONCILED
      };
    });
  }

  function listReconciliations(accountId) {
    assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_DAILY_RECONCILIATIONS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      if (accountId && String(records[i].account_id) !== String(accountId)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    return out;
  }

  return {
    computeExpected: computeExpected,
    getReconciliationData: getReconciliationData,
    saveReconciliation: saveReconciliation,
    listReconciliations: listReconciliations,
    STATUS_DRAFT: STATUS_DRAFT,
    STATUS_RECONCILED: STATUS_RECONCILED,
    STATUS_REOPENED: STATUS_REOPENED
  };
})();
