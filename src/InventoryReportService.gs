/**
 * InventoryReportService.gs
 * Inventory and valuation reports (Sprint 7).
 *
 * R9   Inventory Valuation (per item, weighted average)
 * R10  Inventory Movement Log
 * R11  Low Stock
 *
 * On-hand quantities and valuations come from InventoryValuationService
 * (batches only). Movements are read from the inventory movement ledger.
 */

var InventoryReportService = (function () {
  'use strict';

  var TYPE_STOCK_IN = 'STOCK_IN';
  var TYPE_STOCK_USAGE = 'STOCK_USAGE';
  var TYPE_STOCK_RETURN = 'STOCK_RETURN';
  var TYPE_ADJUSTMENT = 'ADJUSTMENT';
  var TYPE_WRITE_OFF = 'WRITE_OFF';

  function inPeriod(dateIso, from, to) {
    var d = String(dateIso || '');
    return d >= from && d <= to;
  }

  function signedQty(movement) {
    var qty = Number(movement.quantity || 0);
    if (String(movement.movement_type) === TYPE_STOCK_IN ||
        String(movement.movement_type) === TYPE_STOCK_RETURN) {
      return qty;
    }
    if (String(movement.movement_type) === TYPE_STOCK_USAGE ||
        String(movement.movement_type) === TYPE_WRITE_OFF) {
      return -qty;
    }
    // ADJUSTMENT rows carry their own sign.
    return qty;
  }

  /* ------------------------------------------------------------------ */

  /**
   * R9 - Inventory valuation as of today.
   * @param {Object} filters { itemId, category }
   */
  function runValuation(filters) {
    filters = filters || {};
    var activeOnly = filters.activeOnly === undefined ? true : !!filters.activeOnly;
    var list = InventoryRepository.listItems({
      category: filters.category,
      unit: filters.unit,
      activeOnly: activeOnly,
      pageSize: 0
    });
    var items = list.items;
    var batchRecords = RepositoryService.readAll(SheetSchemaService.SHEET_INVENTORY_BATCHES);
    var batchesByItem = {};
    for (var b = 0; b < batchRecords.length; b++) {
      var key = String(batchRecords[b].item_id);
      batchesByItem[key] = batchesByItem[key] || [];
      batchesByItem[key].push(batchRecords[b]);
    }
    var rows = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var balance = InventoryValuationService.computeBalance(batchesByItem[String(item.itemId)] || []);
      rows.push({
        itemId: item.itemId,
        sku: item.sku,
        itemName: item.name,
        category: item.category || '',
        unit: item.unit || '',
        onHand: balance.onHand,
        weightedAvgCost: balance.unitCost,
        value: balance.value,
        isActive: item.isActive !== false
      });
    }

    var totals = { onHand: 0, value: 0 };
    for (var r = 0; r < rows.length; r++) {
      totals.onHand += rows[r].onHand;
      totals.value += rows[r].value;
    }

    return {
      report: 'R9',
      rows: rows,
      totals: {
        onHand: ReportFilterService.round2(totals.onHand),
        value: ReportFilterService.round2(totals.value)
      },
      scope: {
        dateRange: 'As of today',
        transactionTypes: 'InventoryItems with active batches; weighted average cost per batch policy. Inventory value is informational (asset note), not an expense.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R10 - Inventory movement log with running quantity.
   * @param {Object} filters { itemId, fromDate, toDate, movementType }
   */
  function runMovements(filters) {
    filters = filters || {};
    var range = ReportFilterService.normalizeDateRange(filters);
    var from = range.from;
    var to = range.to;

    var records = RepositoryService.readAll(SheetSchemaService.SHEET_INVENTORY_MOVEMENTS);
    var itemsById = {};
    var items = RepositoryService.readAll(SheetSchemaService.SHEET_INVENTORY_ITEMS);
    for (var i = 0; i < items.length; i++) {
      itemsById[String(items[i].item_id)] = items[i];
    }

    var running = {};
    var rows = [];
    for (var m = 0; m < records.length; m++) {
      var mv = records[m];
      var date = ReportFilterService.datePart(mv.created_at);
      if (filters.itemId && String(mv.item_id) !== String(filters.itemId)) {
        continue;
      }
      if (filters.movementType && String(mv.movement_type) !== String(filters.movementType)) {
        continue;
      }
      if (!inPeriod(date, from, to)) {
        continue;
      }
      var qty = signedQty(mv);
      running[String(mv.item_id)] = (running[String(mv.item_id)] || 0) + qty;
      var item = itemsById[String(mv.item_id)];
      rows.push({
        date: date,
        itemId: mv.item_id,
        itemName: item ? item.name : '',
        sku: item ? item.sku : '',
        movementType: mv.movement_type,
        source: mv.source || '',
        quantity: ReportFilterService.round2(qty),
        unitCost: ReportFilterService.round2(Number(mv.unit_cost || 0)),
        value: ReportFilterService.round2(Number(mv.value || qty * Number(mv.unit_cost || 0))),
        runningQty: ReportFilterService.round2(running[String(mv.item_id)])
      });
    }

    rows.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) ||
        String(a.itemId).localeCompare(String(b.itemId));
    });

    var totalValue = 0;
    var totalQty = 0;
    for (var r = 0; r < rows.length; r++) {
      totalValue += rows[r].value;
      totalQty += rows[r].quantity;
    }

    return {
      report: 'R10',
      rows: rows,
      totals: {
        quantity: ReportFilterService.round2(totalQty),
        value: ReportFilterService.round2(totalValue)
      },
      scope: {
        dateRange: from + ' to ' + to,
        transactionTypes: 'InventoryMovements signed by type (STOCK_IN/+ , STOCK_RETURN/+, STOCK_USAGE/-, WRITE_OFF/-, ADJUSTMENT carries its own sign). Running quantity is the ledger position across all time, not the period start.'
      }
    };
  }

  /* ------------------------------------------------------------------ */

  /**
   * R11 - Low stock alerts.
   * @param {Object} filters { itemId, category }
   */
  function runLowStock(filters) {
    filters = filters || {};
    var list = InventoryRepository.listItems({
      category: filters.category,
      unit: filters.unit,
      activeOnly: true,
      pageSize: 0
    });
    var items = list.items;
    var multiplier = SettingsService.getLowStockMultiplier();
    var batchRecords = RepositoryService.readAll(SheetSchemaService.SHEET_INVENTORY_BATCHES);
    var batchesByItem = {};
    for (var b = 0; b < batchRecords.length; b++) {
      var key = String(batchRecords[b].item_id);
      batchesByItem[key] = batchesByItem[key] || [];
      batchesByItem[key].push(batchRecords[b]);
    }
    var rows = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (Number(item.reorderLevel || 0) <= 0) {
        continue;
      }
      var balance = InventoryValuationService.computeBalance(batchesByItem[String(item.itemId)] || []);
      var threshold = Number(item.reorderLevel || 0) * multiplier;
      if (balance.onHand > threshold) {
        continue;
      }
      rows.push({
        itemId: item.itemId,
        sku: item.sku,
        itemName: item.name,
        category: item.category || '',
        unit: item.unit || '',
        reorderLevel: ReportFilterService.round2(Number(item.reorderLevel || 0)),
        onHand: balance.onHand,
        shortage: ReportFilterService.round2(threshold - balance.onHand),
        storageLocation: item.storageLocation || ''
      });
    }

    rows.sort(function (a, b) {
      return b.shortage - a.shortage;
    });

    return {
      report: 'R11',
      rows: rows,
      summary: {
        itemCount: rows.length,
        outOfStockCount: rows.filter(function (r) {
          return r.onHand <= 0;
        }).length
      },
      scope: {
        dateRange: 'As of today',
        transactionTypes: 'Active items with a reorder level where on-hand <= reorder level x LOW_STOCK_MULTIPLIER (default 1; SettingsService). On-hand from active batches. shortage = threshold - on-hand.'
      }
    };
  }

  return {
    runValuation: runValuation,
    runMovements: runMovements,
    runLowStock: runLowStock
  };
})();