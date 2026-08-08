/**
 * InventoryMovementService.gs
 * Stock movements (Sprint 5): record movements, keep batch remaining
 * quantities consistent, and enforce the negative-stock guard.
 *
 * Movement types: STOCK_IN, STOCK_USAGE, STOCK_RETURN, ADJUSTMENT, WRITE_OFF.
 * Sources: PO_RECEIPT, DEPLOYMENT, STOCK_TAKE, CORRECTION, OPENING.
 *
 * Rules:
 * - Outflows (STOCK_USAGE/WRITE_OFF, negative ADJUSTMENT) can never push an
 *   item's on-hand below zero.
 * - STOCK_IN and positive ADJUSTMENT create/adjust batches.
 * - Every movement is audited.
 */

var InventoryMovementService = (function () {
  'use strict';

  var TYPE_STOCK_IN = 'STOCK_IN';
  var TYPE_USAGE = 'STOCK_USAGE';
  var TYPE_RETURN = 'STOCK_RETURN';
  var TYPE_ADJUSTMENT = 'ADJUSTMENT';
  var TYPE_WRITE_OFF = 'WRITE_OFF';

  var MOVEMENT_TYPES = [
    TYPE_STOCK_IN, TYPE_USAGE, TYPE_RETURN, TYPE_ADJUSTMENT, TYPE_WRITE_OFF
  ];

  var SOURCE_PO_RECEIPT = 'PO_RECEIPT';
  var SOURCE_DEPLOYMENT = 'DEPLOYMENT';
  var SOURCE_STOCK_TAKE = 'STOCK_TAKE';
  var SOURCE_CORRECTION = 'CORRECTION';
  var SOURCE_OPENING = 'OPENING';

  var SOURCES = [
    SOURCE_PO_RECEIPT, SOURCE_DEPLOYMENT, SOURCE_STOCK_TAKE, SOURCE_CORRECTION, SOURCE_OPENING
  ];

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
  }

  /**
   * Finds a batch for an item created at a given time, or null.
   */
  function findBatch(itemId, receivedAt) {
    var batches = InventoryRepository.listBatches(itemId);
    for (var i = 0; i < batches.length; i++) {
      if (String(batches[i].received_at || '') === String(receivedAt || '')) {
        return batches[i];
      }
    }
    return null;
  }

  /**
   * Creates a batch for a STOCK_IN movement. Landing cost is prorated
   * into the effective unit cost used for valuation (unit cost stored
   * on the batch remains the purchase unit cost for comparison purposes;
   * batch_cost = qty x (unit_cost + prorated landing)).
   */
  function createBatch(payload) {
    var batchId = IdService.generateId('BCH');
    var receivedAt = payload.receivedAt || DateService.toIsoDate(DateService.now());
    var qtyIn = Number(payload.quantity || 0);
    var unitCost = Number(payload.unitCost || 0);
    var landingCost = Number(payload.landingCost || 0);
    var totalCost = (qtyIn * unitCost) + landingCost;
    var effectiveUnitCost = qtyIn > 0 ? (totalCost / qtyIn) : unitCost;

    var now = DateService.nowIso();
    var actor = payload.actor || AuditService.getActor();
    RepositoryService.appendRecord(InventoryRepository.SHEET_BATCHES, {
      batch_id: batchId,
      item_id: payload.itemId,
      purchase_item_id: payload.purchaseItemId || '',
      received_at: receivedAt,
      qty_in: qtyIn,
      remaining_qty: qtyIn,
      unit_cost: InventoryValuationService.roundMoney(unitCost),
      landing_cost: InventoryValuationService.roundMoney(landingCost),
      batch_cost: InventoryValuationService.roundMoney(totalCost),
      created_at: now,
      created_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
      version: 1
    });
    return {
      batchId: batchId,
      effectiveUnitCost: effectiveUnitCost,
      qtyIn: qtyIn
    };
  }

  function updateBatchRemaining(batchId, remainingQty) {
    var now = DateService.nowIso();
    var actor = AuditService.getActor();
    var record = InventoryRepository.findBatchById(batchId);
    RepositoryService.updateById(InventoryRepository.SHEET_BATCHES, batchId, {
      remaining_qty: InventoryValuationService.roundQty(remainingQty),
      updated_at: now,
      updated_by: actor.userId,
      version: Number(record.version || 1) + 1
    });
  }

  /**
   * Appends one movement row. unit_cost and value are server-rounded.
   * Returns the real movement ID that was written.
   */
  function appendMovement(payload) {
    var now = DateService.nowIso();
    var movementId = IdService.generateId('MV');
    RepositoryService.appendRecord(InventoryRepository.SHEET_MOVEMENTS, {
      movement_id: movementId,
      item_id: payload.itemId,
      batch_id: payload.batchId || '',
      movement_type: payload.type,
      quantity: InventoryValuationService.roundQty(payload.quantity),
      source: payload.source || SOURCE_CORRECTION,
      source_ref_id: payload.sourceRefId || '',
      unit_cost: InventoryValuationService.roundMoney(payload.unitCost || 0),
      value: InventoryValuationService.roundMoney(payload.value || 0),
      reason: payload.reason || '',
      created_by: (payload.actor && payload.actor.userId) || AuditService.getActor().userId,
      created_at: now,
      updated_at: now,
      updated_by: (payload.actor && payload.actor.userId) || AuditService.getActor().userId
    });
    return movementId;
  }

  function requireItem(itemId) {
    var item = InventoryRepository.findItemById(itemId);
    if (!item) {
      throw ErrorService.create(ErrorService.CODES.ITEM_NOT_FOUND, 'The inventory item was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (String(item.is_active) === 'FALSE' || item.is_active === false) {
      throw ErrorService.create(ErrorService.CODES.ITEM_INACTIVE, 'The inventory item is inactive.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return item;
  }

  function roundQty(value) {
    return InventoryValuationService.roundQty(number(value));
  }

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  /**
   * The item's total on-hand across batches.
   */
  function currentOnHand(itemId) {
    var batches = InventoryRepository.listBatches(itemId);
    return InventoryValuationService.onHand(batches);
  }

  /**
   * Prerequisite guard shared by all outbound movements.
   * Throws NEGATIVE_STOCK when withdrawing more than on hand.
   */
  function guardNegativeStock(itemId, quantityOut) {
    var onHand = currentOnHand(itemId);
    if (onHand + quantityOut < -0.0001) {
      throw ErrorService.create(
        ErrorService.CODES.NEGATIVE_STOCK,
        'The movement would make inventory negative. Current on hand: ' +
          InventoryValuationService.roundQty(onHand) + '.',
        { onHand: onHand, requested: quantityOut },
        ErrorService.CATEGORY_CONFLICT
      );
    }
  }

  /**
   * Records a STOCK_IN movement: creates a new batch with full remaining
   * quantity, unit_cost, and prorated landing cost.
   */
  function recordStockIn(payload) {
    assertDatabase();
    var item = requireItem(payload.itemId);
    var quantity = number(payload.quantity);
    var unitCost = number(payload.unitCost);
    if (quantity <= 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Stock in quantity must be greater than zero.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (unitCost < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Unit cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var batch = createBatch({
        itemId: payload.itemId,
        quantity: quantity,
        unitCost: unitCost,
        landingCost: number(payload.landingCost),
        receivedAt: payload.receivedAt,
        purchaseItemId: payload.purchaseItemId,
        actor: actor
      });
      var source = payload.source || SOURCE_PO_RECEIPT;
      var isOpening = source === SOURCE_OPENING;
      var movementId = appendMovement({
        itemId: payload.itemId,
        batchId: batch.batchId,
        type: TYPE_STOCK_IN,
        quantity: quantity,
        source: source,
        sourceRefId: payload.sourceRefId || '',
        unitCost: batch.effectiveUnitCost,
        value: InventoryValuationService.roundMoney(quantity * batch.effectiveUnitCost),
        reason: payload.reason || (isOpening ? 'Opening stock' : 'Stock in'),
        actor: actor
      });
      AuditService.info(isOpening
          ? AuditService.ACTIONS.OPENING_STOCK_RECORDED
          : AuditService.ACTIONS.STOCK_IN_RECORDED,
        'InventoryItems', payload.itemId,
        (isOpening ? 'Opening stock ' : 'Stock in ') + quantity + ' of ' + item.name + ' (' + item.sku + ').');
      return {
        batchId: batch.batchId,
        stockInId: movementId,
        newOnHand: currentOnHand(payload.itemId)
      };
    }, 'inv-stock-in');
  }

  /**
   * Records an outbound movement (STOCK_USAGE or WRITE_OFF): checks
   * negative stock and reduces batches oldest-first.
   */
  function recordUsage(payload) {
    assertDatabase();
    var item = requireItem(payload.itemId);
    var quantity = number(payload.quantity);
    if (quantity <= 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Usage quantity must be greater than zero.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      guardNegativeStock(payload.itemId, -quantity);
      var actor = AuditService.getActor();
      var kind = wantType(payload);

      var batches = InventoryRepository.listBatches(payload.itemId);
      var wavg = InventoryValuationService.weightedAverageUnitCost(batches) || 0;
      var consumed = 0;
      for (var i = 0; i < batches.length && consumed < quantity; i++) {
        var b = batches[i];
        var remaining = Number(b.remaining_qty || 0);
        if (remaining <= 0) {
          continue;
        }
        var take = Math.min(remaining, quantity - consumed);
        updateBatchRemaining(b.batch_id, remaining - take);
        consumed += take;
      }
      /* Material cost at issue uses the weighted-average unit cost
         (fixture FC-8: 5 x 17.33 = 86.67). Batch remaining quantities
         deplete oldest-first; balances are drawn from remaining batch
         values, so no value is double-counted. */
      var movementId = appendMovement({
        itemId: payload.itemId,
        type: kind,
        quantity: -quantity,
        source: payload.source || SOURCE_DEPLOYMENT,
        sourceRefId: payload.sourceRefId || '',
        unitCost: wavg,
        value: -InventoryValuationService.roundMoney(quantity * wavg),
        reason: payload.reason || (kind === TYPE_WRITE_OFF ? 'Write off' : 'Consumed at event'),
        actor: actor
      });
      AuditService.info(kind === TYPE_WRITE_OFF
          ? AuditService.ACTIONS.STOCK_WRITE_OFF_RECORDED
          : kind === TYPE_ADJUSTMENT
            ? AuditService.ACTIONS.STOCK_ADJUSTMENT_RECORDED
            : AuditService.ACTIONS.STOCK_USAGE_RECORDED,
        'InventoryItems', payload.itemId,
        kind + ' ' + quantity + ' of ' + item.name + '.');
      return {
        movementId: movementId,
        actualValue: InventoryValuationService.roundMoney(quantity * wavg)
      };
    }, 'inv-outbound');
  }

  function wantType(payload) {
    if (payload.movementType !== TYPE_USAGE && payload.movementType !== TYPE_WRITE_OFF &&
        payload.movementType !== TYPE_ADJUSTMENT) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Usage requires movementType STOCK_USAGE, WRITE_OFF, or ADJUSTMENT.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return payload.movementType;
  }

  /**
   * Records a STOCK_RETURN movement: adds the quantity back to a batch
   * (the batch it came from, or the oldest open batch), non-reversing.
   */
  function recordStockReturn(payload) {
    assertDatabase();
    var item = requireItem(payload.itemId);
    var quantity = number(payload.quantity);
    if (quantity <= 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Return quantity must be greater than zero.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var batch = payload.batchId ? InventoryRepository.findBatchById(payload.batchId) : null;
      if (!batch || String(batch.item_id) !== String(payload.itemId)) {
        var batches = InventoryRepository.listBatches(payload.itemId);
        batch = batches[batches.length - 1] || null;
      }
      if (!batch) {
        throw ErrorService.create(ErrorService.CODES.ITEM_NOT_FOUND,
          'No batch exists to return stock to. Record a stock in first.', null, ErrorService.CATEGORY_CONFLICT);
      }
      var remaining = Number(batch.remaining_qty || 0) + quantity;
      updateBatchRemaining(batch.batch_id, remaining);
      var unitCost = Number(batch.unit_cost || 0);
      var movementId = appendMovement({
        itemId: payload.itemId,
        batchId: batch.batch_id,
        type: TYPE_RETURN,
        quantity: quantity,
        source: payload.source || SOURCE_CORRECTION,
        sourceRefId: payload.sourceRefId || '',
        unitCost: unitCost,
        value: InventoryValuationService.roundMoney(quantity * unitCost),
        reason: payload.reason || 'Unused stock returned',
        actor: actor
      });
      AuditService.info(AuditService.ACTIONS.STOCK_RETURN_RECORDED, 'Inventory', payload.itemId,
        'Returned ' + quantity + ' of ' + item.name + ' to batch ' + batch.batch_id + '.');
      return { movementId: movementId };
    }, 'inv-return');
  }

  return {
    recordStockIn: recordStockIn,
    recordUsage: recordUsage,
    recordStockReturn: recordStockReturn,
    currentOnHand: currentOnHand,
    guardNegativeStock: guardNegativeStock,
    MOVEMENT_TYPES: MOVEMENT_TYPES,
    TYPES: MOVEMENT_TYPES,
    TYPE_STOCK_IN: TYPE_STOCK_IN,
    TYPE_USAGE: TYPE_USAGE,
    TYPE_RETURN: TYPE_RETURN,
    TYPE_ADJUSTMENT: TYPE_ADJUSTMENT,
    TYPE_WRITE_OFF: TYPE_WRITE_OFF,
    SOURCE_PO_RECEIPT: SOURCE_PO_RECEIPT,
    SOURCE_DEPLOYMENT: SOURCE_DEPLOYMENT,
    SOURCE_STOCK_TAKE: SOURCE_STOCK_TAKE,
    SOURCE_CORRECTION: SOURCE_CORRECTION,
    SOURCE_OPENING: SOURCE_OPENING
  };
})();