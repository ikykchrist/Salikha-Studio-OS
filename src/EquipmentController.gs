/**
 * EquipmentController.gs
 * Server entry points for equipment (Sprint 5): asset registry,
 * movements/maintenance, and status changes. Equipment purchases are
 * capital assets; no equipment action ever creates a cash transaction
 * (payments flow through Expenses).
 */

function getEquipmentList(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(EquipmentService.listEquipments(filters || {}), 'Equipment list retrieved.');
  })();
}

function getEquipment(equipmentId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(EquipmentService.getEquipment(equipmentId), 'Equipment retrieved.');
  })();
}

function createEquipment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(EquipmentService.createEquipment(payload || {}), 'Equipment registered. Capital asset; no expense recorded.');
  })();
}

function updateEquipment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(EquipmentService.updateEquipment(payload || {}), 'Equipment updated.');
  })();
}

function recordEquipmentMovement(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(EquipmentService.recordMovement(payload || {}), 'Equipment movement recorded.');
  })();
}

function setEquipmentStatus(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      EquipmentService.setStatus(payload && payload.equipmentId, payload && payload.status, payload && payload.reason),
      'Equipment status updated.');
  })();
}