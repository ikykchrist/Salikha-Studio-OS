/**
 * InventoryController.gs
 * Server entry points for inventory (Sprint 5): items, balances,
 * stock movements, adjustments, and write-offs. Routed from the
 * frontend via google.script.run; all logic stays in the services.
 *
 * Every mutation entry point enforces the capability matrix
 * (OWNER/ADMIN/OPERATIONS write; FINANCE/CREW/VIEWER read-only) via
 * InventoryPermissionService. Read entry points pass through.
 */

function guardInventoryWrite() {
  InventoryPermissionService.assertCanWrite(AuditService.getActor());
}

function getInventoryItems(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(InventoryService.listItems(filters || {}), 'Inventory items retrieved.');
  })();
}

function getInventoryItem(itemId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(InventoryService.getItemDetail(itemId), 'Inventory item retrieved.');
  })();
}

function createInventoryItem(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(InventoryService.createItem(payload || {}), 'Inventory item created.');
  })();
}

function updateInventoryItem(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(InventoryService.updateItem(payload || {}), 'Inventory item updated.');
  })();
}

function deactivateInventoryItem(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(
      InventoryService.setActive(payload && payload.itemId, false, payload && payload.reason),
      'Inventory item deactivated.');
  })();
}

function reactivateInventoryItem(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(
      InventoryService.setActive(payload && payload.itemId, true, payload && payload.reason),
      'Inventory item reactivated.');
  })();
}

function recordStockIn(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(
      InventoryMovementService.recordStockIn(payload || {}), 'Stock in recorded.');
  })();
}

function recordOpeningStock(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(
      InventoryService.recordOpeningStock(payload || {}), 'Opening stock recorded.');
  })();
}

function recordStockAdjustment(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(InventoryService.adjustStock(payload || {}), 'Stock adjustment recorded.');
  })();
}

function recordStockWriteOff(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(
      InventoryService.adjustStock({
        itemId: payload && payload.itemId,
        quantity: -(Math.abs(Number((payload && payload.quantity) || 0))),
        reason: payload && payload.reason,
        source: payload && payload.source,
        sourceRefId: payload && payload.sourceRefId,
        movementType: 'WRITE_OFF'
      }),
      'Stock write-off recorded.');
  })();
}

function recordStockReturn(payload) {
  return ErrorService.wrap(function () {
    guardInventoryWrite();
    return ResponseService.success(
      InventoryMovementService.recordStockReturn(payload || {}), 'Stock return recorded.');
  })();
}

function getInventoryMovements(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(InventoryService.listMovements(filters || {}), 'Inventory movements retrieved.');
  })();
}

function getInventoryPageData(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(InventoryService.getPageData(filters || {}), 'Inventory page data retrieved.');
  })();
}

function getInventoryItemDetailView(itemId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(InventoryService.getItemDetailView(itemId), 'Inventory item detail retrieved.');
  })();
}