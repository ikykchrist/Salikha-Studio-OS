/**
 * PurchaseController.gs
 * Server entry points for purchasing (Sprint 5/9): suppliers,
 * purchase orders, and receipts. Stock is added to inventory only at
 * receipt; ordering a PO never touches cash.
 *
 * Every mutation entry point enforces the documented capability matrix
 * (OWNER/ADMIN/OPERATIONS write; FINANCE/CREW/VIEWER read-only) via
 * PurchasePermissionService. Read entry points pass through.
 */

function guardPurchasingWrite() {
  PurchasePermissionService.assertCanWrite(AuditService.getActor());
}

function getSuppliers(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(SupplierRepository.listSuppliers(filters || {}), 'Suppliers retrieved.');
  })();
}

function getSupplier(supplierId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(SupplierService.getSupplier(supplierId), 'Supplier retrieved.');
  })();
}

function createSupplier(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(SupplierService.createSupplier(payload || {}), 'Supplier created.');
  })();
}

function updateSupplier(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(SupplierService.updateSupplier(payload || {}), 'Supplier updated.');
  })();
}

function deactivateSupplier(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(
      SupplierService.setActive(payload && payload.supplierId, false, payload && payload.reason),
      'Supplier deactivated.');
  })();
}

function reactivateSupplier(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(
      SupplierService.setActive(payload && payload.supplierId, true, payload && payload.reason),
      'Supplier reactivated.');
  })();
}

function getPurchases(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PurchaseService.listPurchases(filters || {}), 'Purchase orders retrieved.');
  })();
}

function getPurchase(purchaseId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PurchaseService.getPurchase(purchaseId), 'Purchase order retrieved.');
  })();
}

function createPurchase(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(PurchaseService.createPurchase(payload || {}), 'Purchase order created as draft. No cash moved.');
  })();
}

function updatePurchase(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(PurchaseService.updatePurchase(payload || {}), 'Purchase order updated.');
  })();
}

function placePurchaseOrder(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(
      PurchaseService.placeOrder(payload && payload.purchaseId), 'Purchase order placed.');
  })();
}

function cancelPurchase(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(
      PurchaseService.cancelPurchase(payload && payload.purchaseId, payload && payload.reason),
      'Purchase order cancelled.');
  })();
}

function receivePurchase(payload) {
  return ErrorService.wrap(function () {
    guardPurchasingWrite();
    return ResponseService.success(
      PurchaseService.receivePurchase(payload || {}),
      'Purchase receipt recorded. Stock batches created; inventory updated.');
  })();
}

function getPurchasingPageData(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PurchaseService.getPageData(filters || {}),
      'Purchasing page data retrieved.');
  })();
}

function getPurchaseDetailView(purchaseId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PurchaseService.getDetailView(purchaseId),
      'Purchase detail retrieved.');
  })();
}

function getSupplierPanel(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PurchaseService.aggregateSuppliers(filters || {}),
      'Supplier panel retrieved.');
  })();
}