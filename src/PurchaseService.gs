/**
 * PurchaseService.gs
 * Purchase order lifecycle (Sprint 5): DRAFT -> ORDERED ->
 * PARTIALLY_RECEIVED -> RECEIVED (and CANCELLED). Receipt of stock lines
 * posts batch + STOCK_IN movements; receipt of equipment lines updates
 * the equipment registry. Landing/shipping cost is prorated across
 * received stock lines.
 *
 * Key rules:
 * - Creating or ordering a PO never touches cash.
 * - Stock is added to inventory ONLY at receipt (STOCK_IN), never at order.
 * - Receipt is idempotent (client idempotency key); double receipt is ignored.
 * - A received line quantity cannot exceed its remaining receipt quantity.
 * - Purchases are never physically deleted; CANCELLED keeps the row.
 */

var PurchaseService = (function () {
  'use strict';

  var STATUS_DRAFT = 'DRAFT';
  var STATUS_ORDERED = 'ORDERED';
  var STATUS_PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED';
  var STATUS_RECEIVED = 'RECEIVED';
  var STATUS_CANCELLED = 'CANCELLED';

  var STATUSES = [STATUS_DRAFT, STATUS_ORDERED, STATUS_PARTIALLY_RECEIVED, STATUS_RECEIVED, STATUS_CANCELLED];

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

  function number(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function round2(value) {
    return BookingPricingService.round2(value);
  }

  function requirePurchase(purchaseId) {
    var record = PurchaseRepository.findPurchaseById(purchaseId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_NOT_FOUND, 'The purchase order was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function requireSupplier(supplierId) {
    var record = SupplierRepository.findSupplierById(supplierId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.SUPPLIER_NOT_FOUND, 'The supplier was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (String(record.is_active) === 'FALSE' || record.is_active === false) {
      throw ErrorService.create(ErrorService.CODES.SUPPLIER_INACTIVE, 'The supplier is inactive.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return record;
  }

  function requireItem(itemId) {
    var record = InventoryRepository.findItemById(itemId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.ITEM_NOT_FOUND, 'The inventory item was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function isEditableStatus(status) {
    return status === STATUS_DRAFT || status === STATUS_ORDERED;
  }

  /**
   * Augments a purchase public record with lines + supplier name.
   */
  function enrichPurchase(purchaseId) {
    var purchase = PurchaseRepository.getPurchase(purchaseId);
    if (!purchase) {
      return null;
    }
    purchase.supplierName = '';
    var supplier = SupplierRepository.getSupplier(purchase.supplierId);
    if (supplier) {
      purchase.supplierName = supplier.name;
    }
    purchase.lines = PurchaseRepository.getPurchaseItemsPublic(purchaseId);
    for (var i = 0; i < purchase.lines.length; i++) {
      var line = purchase.lines[i];
      line.lineTotal = line.lineTotal != null ? round2(line.lineTotal) : round2(Number(line.quantity || 0) * Number(line.unit_cost || 0));
      line.remainingToReceive = round2(Number(line.quantity || 0) - Number(line.receivedQty || 0));
      line.displayName = line.itemName || line.equipmentName || '';
      line.isStock = !!line.inventoryItemId;
    }
    purchase.total = round2(purchase.total || 0);
    return purchase;
  }

  /**
   * Validates a purchase line object supplied by the client.
   * @return {Object} normalized line
   */
  function prepareLine(line) {
    var quantity = number(line.quantity);
    var unitCost = number(line.unitCost);
    if (quantity <= 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Each line must have a quantity greater than zero.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (unitCost < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Unit cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var stockItemId = ValidationService.trimSafe(line.inventoryItemId);
    var equipmentName = ValidationService.trimSafe(line.equipmentName);
    if (stockItemId) {
      requireItem(stockItemId);
      return {
        inventoryItemId: stockItemId,
        equipmentName: '',
        itemName: '',
        quantity: quantity,
        unitCost: unitCost,
        receivedQty: 0
      };
    }
    if (equipmentName) {
      return {
        inventoryItemId: '',
        equipmentName: equipmentName,
        itemName: '',
        quantity: quantity,
        unitCost: unitCost,
        receivedQty: 0
      };
    }
    throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
      'Each line must reference an inventory item or provide an equipment name.',
      null, ErrorService.CATEGORY_VALIDATION);
  }

  /**
   * Line total for the stored snapshot.
   */
  function lineTotal(line) {
    return round2(number(line.quantity) * number(line.unitCost));
  }

  /**
   * Builds PurchaseItems rows in one batch (atomic line replace).
   */
  function buildLineRows(purchaseId, lines, actor, now) {
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var itemName = '';
      if (line.inventoryItemId) {
        itemName = requireItem(line.inventoryItemId).name;
      } else if (line.equipmentName) {
        itemName = line.equipmentName;
      }
      rows.push({
        purchase_item_id: IdService.generateId('PTC'),
        purchase_id: purchaseId,
        inventory_item_id: line.inventoryItemId || '',
        item_name: itemName,
        equipment_name: line.equipmentName || '',
        quantity: line.quantity,
        unit_cost: round2(line.unitCost),
        line_total: lineTotal(line),
        received_qty: 0,
        batch_id: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
    }
    return rows;
  }

  function applyReceipt(allowed, qty) {
    var want = qty === -1 ? allowed : number(qty);
    return Math.min(Math.max(want, 0), allowed);
  }

  /**
   * Receipt quantity per line id: -1 sentinel means full remaining.
   */
  /**
   * Receipt quantity per line id: -1 sentinel means full remaining.
   * When an explicit line list is given, only those lines are received;
   * unlisted lines map to zero (skipped for this receipt).
   */
  function receivedQuantityMap(payload, lines) {
    var map = {};
    var incoming = payload.lines || payload.receiptLines || [];
    var explicit = incoming.length > 0;
    for (var i = 0; i < incoming.length; i++) {
      var inc = incoming[i];
      var lineId = inc.purchaseItemId || inc.lineId;
      if (lineId) {
        map[String(lineId)] = number(inc.quantity == null ? inc.receivedQty : inc.quantity);
      }
    }
    if (!explicit) {
      for (var l = 0; l < lines.length; l++) {
        map[String(lines[l].purchase_item_id)] = -1;
      }
    }
    return map;
  }

  /**
   * Total value of the received quantities (line value + prorated stock
   * shipping share), for receipts reporting.
   */
  function totalReceivedValue(storedLines, receipts, shipping) {
    var total = 0;
    var stockBox = {};
    for (var i = 0; i < storedLines.length; i++) {
      var line = storedLines[i];
      var already = round2(Number(line.received_qty || 0));
      var available = round2(Number(line.quantity || 0) - already);
      if (available <= 0) {
        continue;
      }
      var want = receipts[String(line.purchase_item_id)];
      var qtyNow = applyReceipt(available, want === undefined ? 0 : want);
      if (qtyNow <= 0) {
        continue;
      }
      var unitCost = round2(Number(line.unit_cost || 0));
      total += round2(qtyNow * unitCost);
      if (line.inventory_item_id) {
        stockBox[String(line.purchase_item_id)] = { qty: qtyNow, value: round2(qtyNow * unitCost) };
      }
    }
    if (shipping > 0) {
      var totalStockValue = 0;
      for (var key in stockBox) {
        if (Object.prototype.hasOwnProperty.call(stockBox, key)) {
          totalStockValue += stockBox[key].value;
        }
      }
      if (totalStockValue > 0) {
        for (var k in stockBox) {
          if (Object.prototype.hasOwnProperty.call(stockBox, k)) {
            total += round2(stockBox[k].value / totalStockValue * shipping);
          }
        }
      }
    }
    return total;
  }

  /**
   * Prorates shipping cost across the received stock quantities of
   * this line based on line value share (landing cost on the batch).
   */
  function allocateShipping(lineValue, storedLines, shipping) {
    if (shipping <= 0 || lineValue <= 0) {
      return 0;
    }
    var totalStockValue = 0;
    for (var i = 0; i < storedLines.length; i++) {
      if (!storedLines[i].inventory_item_id) {
        continue;
      }
      totalStockValue += round2(Number(storedLines[i].quantity || 0) * Number(storedLines[i].unit_cost || 0));
    }
    if (totalStockValue <= 0) {
      return 0;
    }
    return round2(lineValue / totalStockValue * shipping);
  }

  function createEquipmentRecord(equipmentLine) {
    var now = DateService.nowIso();
    var actor = AuditService.getActor();
    var equipmentId = IdService.generateId('EQP');
    RepositoryService.appendRecord(EquipmentRepository.SHEET_EQUIPMENT, {
      equipment_id: equipmentId,
      name: equipmentLine.equipmentName,
      category: 'OTHER',
      serial_number: '',
      purchase_date: DateService.toIsoDate(DateService.now()),
      purchase_price: round2(Number(equipmentLine.unit_cost || 0)),
      useful_life_months: 36,
      condition: 'GOOD',
      status: 'IN_SERVICE',
      notes: 'From purchase order receipt.',
      created_at: now,
      created_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
      version: 1
    });
    return equipmentId;
  }

  function createPurchase(payload) {
    assertDatabase();
    var supplier = requireSupplier(payload.supplierId);
    var purchaseDate = payload.purchaseDate || DateService.toIsoDate(DateService.now());
    if (!DateService.isValidDate(purchaseDate)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Purchase date is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var expectedDate = payload.expectedDate;
    if (expectedDate && !DateService.isValidDate(expectedDate)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Expected date is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var shipping = number(payload.shippingCost);
    if (shipping < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Shipping cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var lines = payload.lines || [];
    if (lines.length === 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A purchase order must have at least one line.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var preparedLines = [];
    for (var i = 0; i < lines.length; i++) {
      preparedLines.push(prepareLine(lines[i]));
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var purchaseId = IdService.generateId('PCH');
      var total = shipping;
      for (var lineIdx = 0; lineIdx < preparedLines.length; lineIdx++) {
        total += lineTotal(preparedLines[lineIdx]);
      }
      total = round2(total);

      RepositoryService.appendRecord(PurchaseRepository.SHEET_PURCHASES, {
        purchase_id: purchaseId,
        supplier_id: payload.supplierId,
        purchase_date: purchaseDate,
        expected_date: expectedDate || '',
        status: STATUS_DRAFT,
        shipping_cost: round2(shipping),
        total: total,
        notes: ValidationService.trimSafe(payload.notes),
        idempotency_key: ValidationService.trimSafe(payload.idempotencyKey),
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      var rows = buildLineRows(purchaseId, preparedLines, actor, now);
      RepositoryService.batchAppend(PurchaseRepository.SHEET_PURCHASE_ITEMS, rows);
      AuditService.info(AuditService.ACTIONS.PURCHASE_CREATED, 'Purchases', purchaseId,
        'Created purchase order ' + purchaseId + ' (' + rows.length + ' line(s)).');
      return enrichPurchase(purchaseId);
    }, 'purchase-create');
  }

  function updatePurchase(payload) {
    assertDatabase();
    var record = requirePurchase(payload.purchaseId);
    if (!isEditableStatus(String(record.status))) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_INVALID_STATUS,
        'Only DRAFT or ORDERED purchase orders can be edited.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var existing = PurchaseRepository.listPurchaseItems(payload.purchaseId);
    for (var i = 0; i < existing.length; i++) {
      if (Number(existing[i].received_qty || 0) > 0) {
        throw ErrorService.create(ErrorService.CODES.PURCHASE_INVALID_STATUS,
          'Received lines cannot be edited. Void or close the purchase order first.',
          null, ErrorService.CATEGORY_CONFLICT);
      }
    }
    var lines = payload.lines || [];
    if (lines.length === 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'A purchase order must have at least one line.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var prepared = [];
    for (var l = 0; l < lines.length; l++) {
      prepared.push(prepareLine(lines[l]));
    }
    var shipping = number(payload.shippingCost == null ? record.shipping_cost : payload.shippingCost);
    if (shipping < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Shipping cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      /* Replace lines atomically: clear all PO lines, then re-append.
         This is the documented editor-owned exception to row preservation. */
      RepositoryService.clearRowsByField(PurchaseRepository.SHEET_PURCHASE_ITEMS, 'purchase_id', payload.purchaseId);
      var rows = buildLineRows(payload.purchaseId, prepared, actor, now);
      RepositoryService.batchAppend(PurchaseRepository.SHEET_PURCHASE_ITEMS, rows);
      var total = shipping;
      for (var p = 0; p < prepared.length; p++) {
        total += lineTotal(prepared[p]);
      }
      total = round2(total);
      RepositoryService.updateById(PurchaseRepository.SHEET_PURCHASES, payload.purchaseId, {
        shipping_cost: round2(shipping),
        total: total,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PURCHASE_UPDATED, 'Purchases', payload.purchaseId,
        'Updated purchase order ' + payload.purchaseId + ' (' + rows.length + ' line(s)).');
      return enrichPurchase(payload.purchaseId);
    }, 'purchase-update');
  }

  function placeOrder(purchaseId) {
    assertDatabase();
    var record = requirePurchase(purchaseId);
    if (String(record.status) !== STATUS_DRAFT) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_INVALID_STATUS,
        'Only DRAFT purchase orders can be placed.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(PurchaseRepository.SHEET_PURCHASES, purchaseId, {
        status: STATUS_ORDERED,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PURCHASE_ORDERED, 'Purchases', purchaseId,
        'Placed purchase order ' + purchaseId + '.');
      return enrichPurchase(purchaseId);
    }, 'purchase-order');
  }

  function cancelPurchase(purchaseId, reason) {
    assertDatabase();
    var record = requirePurchase(purchaseId);
    var currentStatus = String(record.status);
    if (currentStatus === STATUS_RECEIVED || currentStatus === STATUS_CANCELLED) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_INVALID_STATUS,
        'A received or cancelled purchase order cannot be cancelled.', null, ErrorService.CATEGORY_CONFLICT);
    }
    reason = ValidationService.trimSafe(reason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_CANCEL_REASON_REQUIRED,
        'A cancellation reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(PurchaseRepository.SHEET_PURCHASES, purchaseId, {
        status: STATUS_CANCELLED,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PURCHASE_CANCELLED, 'Purchases', purchaseId,
        'Cancelled purchase order ' + purchaseId + '. Reason: ' + reason);
      return enrichPurchase(purchaseId);
    }, 'purchase-cancel');
  }

  /**
   * Returns true when a receipt with this idempotency key was already
   * recorded for this purchase order. The PURCHASE_RECEIVED audit entry
   * carries the key in its metadata; receipts are never double-posted.
   */
  function receiptAlreadyProcessed(purchaseId, idempotencyKey) {
    if (!idempotencyKey) {
      return false;
    }
    var audits = RepositoryService.findByField(SheetSchemaService.SHEET_AUDIT_LOGS, 'entity_id', purchaseId);
    for (var i = 0; i < audits.length; i++) {
      var a = audits[i];
      if (String(a.action || '') !== AuditService.ACTIONS.PURCHASE_RECEIVED) {
        continue;
      }
      try {
        var meta = JSON.parse(String(a.metadata || '{}'));
        if (meta && String(meta.idempotencyKey) === String(idempotencyKey)) {
          return true;
        }
      } catch (ignored) {
        /* unreadable metadata is never treated as a match */
      }
    }
    return false;
  }

  function receivePurchase(payload) {
    assertDatabase();
    var purchaseId = payload.purchaseId;
    var record = requirePurchase(purchaseId);
    if (String(record.status) === STATUS_CANCELLED) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_INVALID_STATUS,
        'A cancelled purchase order cannot be received.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var idempotencyKey = ValidationService.trimSafe(payload.idempotencyKey);

    var storedLines = PurchaseRepository.listPurchaseItems(purchaseId);
    if (storedLines.length === 0) {
      throw ErrorService.create(ErrorService.CODES.PURCHASE_LINE_NOT_FOUND,
        'This purchase order has no lines to receive.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var shipping = number(record.shipping_cost) || 0;
    var receipts = receivedQuantityMap(payload, storedLines);

    return LockManager.run(function () {
      if (receiptAlreadyProcessed(purchaseId, idempotencyKey)) {
        throw ErrorService.create(ErrorService.CODES.RECEIPT_IDEMPOTENCY_EXISTS,
          'This purchase receipt was already recorded.', null, ErrorService.CATEGORY_CONFLICT);
      }
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var receivedDate = payload.receivedDate && DateService.isValidDate(payload.receivedDate)
        ? DateService.toIsoDate(payload.receivedDate) : DateService.toIsoDate(DateService.now());

      var equipmentIds = [];
      var batchIds = [];
      var anyReceived = false;
      var allCompleted = true;

      for (var i = 0; i < storedLines.length; i++) {
        var line = storedLines[i];
        var lineId = String(line.purchase_item_id);
        var already = round2(Number(line.received_qty || 0));
        var available = round2(Number(line.quantity || 0) - already);
        if (available <= 0) {
          continue;
        }
        var wantQty = receipts[lineId] === undefined ? 0 : receipts[lineId];
        if (wantQty !== -1 && wantQty > available + 0.00001) {
          throw ErrorService.create(ErrorService.CODES.PURCHASE_RECEIVED_EXCEEDS_QTY,
            'Receive quantity ' + wantQty + ' exceeds the outstanding ' + available +
              ' for line ' + (line.item_name || line.equipment_name || line.purchase_item_id) + '.',
            null, ErrorService.CATEGORY_CONFLICT);
        }
        var qty = applyReceipt(available, wantQty);
        if (qty <= 0) {
          allCompleted = false;
          continue;
        }
        anyReceived = true;
        var batchId = '';
        var lineValue = round2(qty * Number(line.unit_cost || 0));
        if (line.inventory_item_id) {
          var landing = allocateShipping(lineValue, storedLines, shipping);
          var stockIn = InventoryMovementService.recordStockIn({
            itemId: line.inventory_item_id,
            quantity: qty,
            unitCost: Number(line.unit_cost || 0),
            landingCost: landing,
            receivedAt: receivedDate,
            purchaseItemId: line.purchase_item_id,
            source: InventoryMovementService.SOURCE_PO_RECEIPT,
            sourceRefId: purchaseId,
            reason: 'Purchase ' + purchaseId + ' receipt'
          });
          batchId = stockIn.batchId;
          if (batchId) {
            batchIds.push(batchId);
          }
        } else if (line.equipment_name) {
          var equipmentId = createEquipmentRecord(line);
          equipmentIds.push(equipmentId);
        }
        RepositoryService.updateById(PurchaseRepository.SHEET_PURCHASE_ITEMS, line.purchase_item_id, {
          received_qty: round2(already + qty),
          batch_id: batchId,
          updated_at: now,
          updated_by: actor.userId
        });
        if (already + qty < Number(line.quantity || 0)) {
          allCompleted = false;
        }
      }

      if (!anyReceived) {
        throw ErrorService.create(ErrorService.CODES.PURCHASE_ALREADY_RECEIVED,
          'All lines of this purchase order have already been received.',
          null, ErrorService.CATEGORY_CONFLICT);
      }

      var newStatus = allCompleted ? STATUS_RECEIVED : STATUS_PARTIALLY_RECEIVED;
      var totalValue = round2(totalReceivedValue(storedLines, receipts, shipping));
      RepositoryService.updateById(PurchaseRepository.SHEET_PURCHASES, purchaseId, {
        status: newStatus,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PURCHASE_RECEIVED, 'Purchases', purchaseId,
        (allCompleted ? 'Received purchase order ' : 'Partially received purchase order ') +
          purchaseId + ' (' + batchIds.length + ' stock batch(es), ' + equipmentIds.length + ' equipment).',
        { metadata: { idempotencyKey: idempotencyKey } });
      return {
        purchase: enrichPurchase(purchaseId),
        batchIds: batchIds,
        equipmentIds: equipmentIds,
        valueReceived: totalValue
      };
    }, 'purchase-receive');
  }

  function getPurchase(purchaseId) {
    assertDatabase();
    return enrichPurchase(purchaseId);
  }

  function listPurchases(filters) {
    assertDatabase();
    return PurchaseRepository.listPurchases(filters);
  }

  /**
   * Aggregated supplier list with purchase counts + last purchase date.
   * One full read of Suppliers + one full read of Purchases, grouped in
   * memory (no per-supplier queries). Powers the supplier panel on the
   * Purchasing page.
   */
  function aggregateSuppliers(filters) {
    assertDatabase();
    filters = filters || {};
    var page = SupplierRepository.listSuppliers({
      search: filters.search,
      activeOnly: filters.activeOnly
    });
    var allPurchases = RepositoryService.readAll(PurchaseRepository.SHEET_PURCHASES);
    var counts = {};
    var lastDate = {};
    for (var i = 0; i < allPurchases.length; i++) {
      var sid = String(allPurchases[i].supplier_id || '');
      if (!sid) continue;
      counts[sid] = (counts[sid] || 0) + 1;
      var d = String(allPurchases[i].purchase_date || '');
      if (d && (!lastDate[sid] || d > lastDate[sid])) {
        lastDate[sid] = d;
      }
    }
    var rows = [];
    for (var r = 0; r < page.items.length; r++) {
      var s = page.items[r];
      rows.push({
        supplier: s,
        purchaseCount: counts[String(s.supplierId)] || 0,
        lastPurchaseDate: lastDate[String(s.supplierId)] || ''
      });
    }
    return {
      items: rows,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /**
   * Single-request page model for the Purchasing screen:
   *   - summary KPIs (counts per status)
   *   - enriched purchase list rows with supplier name + line summary
   *   - supplier panel (with counts)
   *   - inventory item lookup (for the create-purchase modal)
   *
   * Sheet reads in this request:
   *   1) Purchases (filtered + paginated in memory)
   *   2) PurchaseItems (grouped in memory by purchase_id)
   *   3) Suppliers (lookup map)
   *   4) InventoryItems (lookup for the create modal)
   *   5) InventoryBatches (not needed here; reserved for receipt history)
   */
  function getPageData(filters) {
    assertDatabase();
    filters = filters || {};
    var purchasesPage = PurchaseRepository.listPurchases({
      search: filters.search,
      status: filters.status,
      supplierId: filters.supplierId,
      page: filters.page,
      pageSize: filters.pageSize,
      sort: filters.sort
    });

    var allItems = RepositoryService.readAll(PurchaseRepository.SHEET_PURCHASE_ITEMS);
    var itemsByPurchase = {};
    var itemsById = {};
    for (var i = 0; i < allItems.length; i++) {
      var it = allItems[i];
      itemsById[String(it.purchase_item_id)] = it;
      var pid = String(it.purchase_id);
      if (!itemsByPurchase[pid]) itemsByPurchase[pid] = [];
      itemsByPurchase[pid].push(it);
    }

    var supplierRecords = RepositoryService.readAll(SupplierRepository.SHEET_SUPPLIERS);
    var supplierMap = {};
    var supplierSummary = { total: 0, active: 0, inactive: 0 };
    for (var s = 0; s < supplierRecords.length; s++) {
      var sr = supplierRecords[s];
      supplierMap[String(sr.supplier_id)] = sr;
      supplierSummary.total++;
      var isActive = !(String(sr.is_active) === 'FALSE' || sr.is_active === false);
      if (isActive) supplierSummary.active++;
      else supplierSummary.inactive++;
    }

    var inventoryItems = InventoryRepository.listItems({ activeOnly: true, pageSize: 0 }).items;
    var inventoryLookup = [];
    for (var inv = 0; inv < inventoryItems.length; inv++) {
      var item = inventoryItems[inv];
      inventoryLookup.push({
        itemId: item.itemId,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        category: item.category
      });
    }

    var statusCounts = { DRAFT: 0, ORDERED: 0, PARTIALLY_RECEIVED: 0, RECEIVED: 0, CANCELLED: 0 };
    for (var p = 0; p < purchasesPage.items.length; p++) {
      var st = String(purchasesPage.items[p].status);
      if (statusCounts.hasOwnProperty(st)) statusCounts[st]++;
    }

    var rows = [];
    for (var k = 0; k < purchasesPage.items.length; k++) {
      var purchase = purchasesPage.items[k];
      var sup = supplierMap[String(purchase.supplierId)];
      var purchaseLines = itemsByPurchase[String(purchase.purchaseId)] || [];
      var lineCount = purchaseLines.length;
      var orderedTotal = 0;
      var receivedTotal = 0;
      for (var l = 0; l < purchaseLines.length; l++) {
        orderedTotal += number(purchaseLines[l].quantity);
        receivedTotal += number(purchaseLines[l].received_qty);
      }
      var progressPct = orderedTotal > 0 ? Math.min(100, Math.round((receivedTotal / orderedTotal) * 100)) : 0;
      rows.push({
        purchase: purchase,
        supplierName: sup ? sup.name : '',
        lineCount: lineCount,
        orderedTotal: round2(orderedTotal),
        receivedTotal: round2(receivedTotal),
        progressPct: progressPct
      });
    }

    return {
      summary: {
        total: purchasesPage.total,
        statusCounts: statusCounts,
        supplierSummary: supplierSummary
      },
      purchases: rows,
      total: purchasesPage.total,
      page: purchasesPage.page,
      pageSize: purchasesPage.pageSize,
      lookups: {
        statuses: STATUSES.slice(0),
        suppliers: Object.keys(supplierMap).map(function (id) {
          var s = supplierMap[id];
          return {
            supplierId: s.supplier_id,
            name: s.name,
            isActive: !(String(s.is_active) === 'FALSE' || s.is_active === false)
          };
        }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }),
        inventoryItems: inventoryLookup
      }
    };
  }

  /**
   * Detail for one purchase: purchase + lines + supplier + receipt
   * history derived from STOCK_IN movements (one read each for
   * InventoryBatches and InventoryMovements, grouped in memory).
   */
  function getDetailView(purchaseId) {
    assertDatabase();
    var purchase = enrichPurchase(purchaseId);
    if (!purchase) {
      return null;
    }
    var batches = RepositoryService.readAll(SheetSchemaService.SHEET_INVENTORY_BATCHES);
    var batchByPurchaseItem = {};
    var batchById = {};
    for (var b = 0; b < batches.length; b++) {
      var bch = batches[b];
      batchById[String(bch.batch_id)] = bch;
      var pkey = String(bch.purchase_item_id || '');
      if (pkey) {
        batchByPurchaseItem[pkey] = bch;
      }
    }
    var movements = RepositoryService.readAll(SheetSchemaService.SHEET_INVENTORY_MOVEMENTS);
    var receiptHistory = [];
    for (var m = 0; m < movements.length; m++) {
      var mv = movements[m];
      if (String(mv.source || '') === 'PO_RECEIPT' &&
          String(mv.source_ref_id || '') === String(purchaseId) &&
          String(mv.movement_type || '') === 'STOCK_IN') {
        var batch = batchById[String(mv.batch_id || '')] || null;
        receiptHistory.push({
          movementId: mv.movement_id,
          itemId: mv.item_id,
          batchId: mv.batch_id,
          quantity: number(mv.quantity),
          unitCost: number(mv.unit_cost),
          value: number(mv.value),
          receivedAt: mv.received_at || mv.created_at,
          actor: mv.created_by,
          purchaseItemId: batch ? batch.purchase_item_id : ''
        });
      }
    }
    receiptHistory.sort(function (a, b) {
      return String(a.receivedAt).localeCompare(String(b.receivedAt));
    });
    return {
      purchase: purchase,
      receiptHistory: receiptHistory
    };
  }

  return {
    createPurchase: createPurchase,
    updatePurchase: updatePurchase,
    placeOrder: placeOrder,
    cancelPurchase: cancelPurchase,
    receivePurchase: receivePurchase,
    getPurchase: getPurchase,
    listPurchases: listPurchases,
    enrichPurchase: enrichPurchase,
    getPageData: getPageData,
    getDetailView: getDetailView,
    aggregateSuppliers: aggregateSuppliers,
    STATUSES: STATUSES,
    STATUS_DRAFT: STATUS_DRAFT,
    STATUS_ORDERED: STATUS_ORDERED,
    STATUS_PARTIALLY_RECEIVED: STATUS_PARTIALLY_RECEIVED,
    STATUS_RECEIVED: STATUS_RECEIVED,
    STATUS_CANCELLED: STATUS_CANCELLED
  };
})();