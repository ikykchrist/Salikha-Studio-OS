/**
 * InventoryValuationService.gs
 * Weighted-average valuation for inventory (Sprint 5).
 *
 * On-hand quantity  = sum of remaining_qty over the item's batches.
 * Weighted-average  = sum(batch value) / sum(remaining qty).
 * Inventory value   = sum(batch value) where each batch value is
 *   remainingQty x unitCost (landing cost already folded into unitCost
 *   by the receipt flow).
 *
 * Purely derived: no writes, no business decisions. Display rounding
 * follows the project convention (2 decimals for money, 4 for unit
 * quantities when fractional).
 */

var InventoryValuationService = (function () {
  'use strict';

  function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function roundQty(value) {
    return Math.round(Number(value || 0) * 10000) / 10000;
  }

  /**
   * Value of a batch's remaining stock.
   */
  function batchRemainingValue(batch) {
    return roundMoney(Number(batch.remaining_qty || 0) * Number(batch.unit_cost || 0));
  }

  /**
   * Aggregate on-hand quantity across batches.
   */
  function onHand(batches) {
    var total = 0;
    for (var i = 0; i < batches.length; i++) {
      total += Number(batches[i].remaining_qty || 0);
    }
    return roundQty(total);
  }

  /**
   * Weighted average unit cost across batches (quantity-weighted).
   * Returns null when there is no on-hand stock.
   */
  function weightedAverageUnitCost(batches) {
    var totalQty = 0;
    var totalValue = 0;
    for (var i = 0; i < batches.length; i++) {
      var qty = Number(batches[i].remaining_qty || 0);
      totalQty += qty;
      totalValue += qty * Number(batches[i].unit_cost || 0);
    }
    if (totalQty <= 0) {
      return null;
    }
    return roundMoney(totalValue / totalQty);
  }

  /**
   * Total inventory value across batches.
   */
  function inventoryValue(batches) {
    var total = 0;
    for (var i = 0; i < batches.length; i++) {
      total += Number(batchRemainingValue(batches[i]));
    }
    return roundMoney(total);
  }

  /**
   * Aggregated balance for an item.
   * @return {Object} { onHand, unitCost, value, hasStock }
   */
  function computeBalance(batches) {
    batches = batches || [];
    var oh = onHand(batches);
    var unitCost = weightedAverageUnitCost(batches);
    var value = oh > 0 ? inventoryValue(batches) : 0;
    return {
      onHand: oh,
      unitCost: unitCost === null ? 0 : unitCost,
      value: value,
      hasStock: oh > 0
    };
  }

  return {
    roundMoney: roundMoney,
    roundQty: roundQty,
    batchRemainingValue: batchRemainingValue,
    onHand: onHand,
    weightedAverageUnitCost: weightedAverageUnitCost,
    inventoryValue: inventoryValue,
    computeBalance: computeBalance
  };
})();