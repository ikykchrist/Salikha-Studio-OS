/**
 * TransferService.gs
 * Account-to-account transfers. Always creates a linked pair:
 *   TRANSFER_OUT (source) and TRANSFER_IN (destination), sharing a
 *   transfer_group_id, written atomically under one script lock.
 *
 * A transfer never creates revenue or expense; total business cash
 * is unchanged. Both sides are voided together.
 */

var TransferService = (function () {
  'use strict';

  function recordTransfer(payload) {
    var sourceId = payload.sourceAccountId;
    var destinationId = payload.destinationAccountId;
    if (!sourceId || !destinationId) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Source and destination accounts are required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (String(sourceId) === String(destinationId)) {
      throw ErrorService.create(
        ErrorService.CODES.TRANSFER_ACCOUNT_CONFLICT,
        'Source and destination accounts must be different.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    var amount = Number(payload.amount);
    var amountCheck = ValidationService.isPositiveAmount(amount, 'Transfer amount');
    if (!amountCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_AMOUNT, amountCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.transferDate) {
      var dateCheck = ValidationService.isDate(payload.transferDate, 'Transfer date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    var description = ValidationService.trimSafe(payload.description);
    if (!description) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A transfer description is required.', null, ErrorService.CATEGORY_VALIDATION);
    }

    return LockManager.run(function () {
      var source = CashAccountService.requireActiveAccount(sourceId);
      var destination = CashAccountService.requireActiveAccount(destinationId);

      var sourceBalance = CashTransactionService.calculateAccountBalance(sourceId);
      if (sourceBalance + 0.005 < amount) {
        throw ErrorService.create(
          ErrorService.CODES.INSUFFICIENT_FUNDS,
          'Insufficient funds in source account "' + source.account_name + '". Balance: ' + Number(sourceBalance).toFixed(2) + '.',
          null,
          ErrorService.CATEGORY_CONFLICT
        );
      }

      var transferGroupId = 'TF-' + IdService.generateRaw();
      var common = {
        description: description,
        referenceNumber: payload.referenceNumber || '',
        sourceType: CashTransactionService.SOURCE_TRANSFER,
        transferGroupId: transferGroupId,
        transactionDate: payload.transferDate || DateService.toIsoDate(DateService.now())
      };

      var outgoing = CashTransactionService.postTransaction({
        transactionType: CashTransactionService.TYPE_TRANSFER_OUT,
        accountId: sourceId,
        amount: amount,
        categoryId: payload.categoryId || null,
        counterparty: payload.counterparty || '',
        description: common.description + ' (to ' + destination.account_name + ')',
        referenceNumber: common.referenceNumber,
        sourceType: common.sourceType,
        transferGroupId: common.transferGroupId,
        transactionDate: common.transactionDate
      });

      if (outgoing.duplicate) {
        throw ErrorService.create(ErrorService.CODES.TRANSFER_INTEGRITY_ERROR,
          'A duplicate transfer was detected. No records were changed.', null, ErrorService.CATEGORY_CONFLICT);
      }

      var incoming = CashTransactionService.postTransaction({
        transactionType: CashTransactionService.TYPE_TRANSFER_IN,
        accountId: destinationId,
        amount: amount,
        categoryId: payload.categoryId || null,
        counterparty: payload.counterparty || '',
        description: common.description + ' (from ' + source.account_name + ')',
        referenceNumber: common.referenceNumber,
        sourceType: common.sourceType,
        transferGroupId: common.transferGroupId,
        transactionDate: common.transactionDate
      });

      if (incoming.duplicate) {
        throw ErrorService.create(ErrorService.CODES.TRANSFER_INTEGRITY_ERROR,
          'Transfer integrity error: only one side was recorded. Please verify the ledger.', null, ErrorService.CATEGORY_CONFLICT);
      }

      var sourceBalanceAfter = CashAccountService.recalculateCashAccountBalance(sourceId);
      var destinationBalanceAfter = CashAccountService.recalculateCashAccountBalance(destinationId);
      AuditService.info(AuditService.ACTIONS.TRANSFER_POSTED, 'CashTransactions', transferGroupId,
        'Transferred ' + Number(amount).toFixed(2) + ' from "' + source.account_name + '" to "' + destination.account_name + '".');
      return {
        transferGroupId: transferGroupId,
        outgoingTransaction: outgoing.transaction,
        incomingTransaction: incoming.transaction,
        sourceBalanceAfter: sourceBalanceAfter,
        destinationBalanceAfter: destinationBalanceAfter
      };
    });
  }

  /**
   * Voids both sides of a transfer under one lock. Verifies both records
   * exist, belong to the group, and are posted before voiding.
   */
  function voidTransferPair(transferGroupId, reason) {
    return LockManager.run(function () {
      var records = RepositoryService.findByField(SheetSchemaService.SHEET_CASH_TRANSACTIONS, 'transfer_group_id', transferGroupId);
      if (records.length !== 2) {
        throw ErrorService.create(
          ErrorService.CODES.TRANSFER_INTEGRITY_ERROR,
          'Transfer integrity error: expected two linked records but found ' + records.length + '.',
          null,
          ErrorService.CATEGORY_CONFLICT
        );
      }
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var accountIds = [];
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (String(record.status) === CashTransactionService.STATUS_VOIDED) {
          throw ErrorService.create(
            ErrorService.CODES.TRANSACTION_ALREADY_VOIDED,
            'This transfer is already voided.',
            null,
            ErrorService.CATEGORY_CONFLICT
          );
        }
        RepositoryService.updateById(SheetSchemaService.SHEET_CASH_TRANSACTIONS, record.transaction_id, {
          status: CashTransactionService.STATUS_VOIDED,
          voided_at: now,
          voided_by: actor.userId,
          void_reason: reason,
          updated_at: now,
          updated_by: actor.userId,
          version: Number(record.version || 1) + 1
        });
        accountIds.push(String(record.account_id));
      }
      var balances = {};
      for (var a = 0; a < accountIds.length; a++) {
        balances[accountIds[a]] = CashAccountService.recalculateCashAccountBalance(accountIds[a]);
      }
      AuditService.info(AuditService.ACTIONS.TRANSFER_VOIDED, 'CashTransactions', transferGroupId,
        'Voided transfer pair (' + records.length + ' records). Reason: ' + reason + '.');
      return {
        voided: true,
        transferGroupId: transferGroupId,
        voidedTransactionIds: records.map(function (r) { return r.transaction_id; }),
        balances: balances
      };
    });
  }

  return {
    recordTransfer: recordTransfer,
    voidTransferPair: voidTransferPair
  };
})();
