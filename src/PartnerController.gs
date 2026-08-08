/**
 * PartnerController.gs
 * Server entry points for partners and commissions (Sprint 6). A settled
 * commission posts exactly one EXPENSE cash transaction with idempotency
 * protection.
 */

function getPartners(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PartnerService.listPartners(filters || {}), 'Partners retrieved.');
  })();
}

function getPartner(partnerId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PartnerService.getPartner(partnerId), 'Partner retrieved.');
  })();
}

function createPartner(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PartnerService.createPartner(payload || {}), 'Partner created.');
  })();
}

function updatePartner(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PartnerService.updatePartner(payload || {}), 'Partner updated.');
  })();
}

function deactivatePartner(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PartnerService.setPartnerActive(payload && payload.partnerId, false, payload && payload.reason),
      'Partner deactivated.');
  })();
}

function reactivatePartner(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PartnerService.setPartnerActive(payload && payload.partnerId, true, payload && payload.reason),
      'Partner reactivated.');
  })();
}

function getCommissions(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(PartnerCommissionService.listCommissions(filters || {}), 'Commissions retrieved.');
  })();
}

function createCommission(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PartnerCommissionService.createCommission(payload || {}), 'Commission created as PENDING.');
  })();
}

function advanceCommissionToDue(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PartnerCommissionService.advanceToDue(payload && payload.commissionId, payload && payload.reason),
      'Commission marked DUE.');
  })();
}

function settleCommission(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PartnerCommissionService.settleCommission(payload || {}), 'Commission settled and posted to cash.');
  })();
}

function voidCommission(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      PartnerCommissionService.voidSettledCommission(payload && payload.commissionId, payload && payload.reason),
      'Commission settlement voided. Cash restored.');
  })();
}