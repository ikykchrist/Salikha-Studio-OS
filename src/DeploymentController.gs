/**
 * DeploymentController.gs
 * Server entry points for event deployments (Sprint 6). One deployment
 * per booking (1:1); lifecycle and reconciliation are enforced server-side.
 */

function getDeployments(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(DeploymentService.listDeployments(filters || {}), 'Deployments retrieved.');
  })();
}

function getDeployment(deploymentId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(DeploymentService.getDeployment(deploymentId), 'Deployment retrieved.');
  })();
}

function getDeploymentByBooking(bookingId) {
  return ErrorService.wrap(function () {
    var deployment = DeploymentService.findDeploymentByBooking(bookingId);
    return ResponseService.success(
      deployment ? DeploymentService.getDeployment(deployment.deployment_id || deployment.deploymentId) : null,
      'Deployment retrieved.');
  })();
}

function createDeployment(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.createDeployment(bookingId, {}), 'Deployment created as PLANNED.');
  })();
}

function startDeploymentLoading(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.startLoading(payload && payload.deploymentId), 'Loading started. Loaded quantities captured.');
  })();
}

function departDeployment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.depart(payload && payload.deploymentId), 'Deployment departed; loaded quantities locked.');
  })();
}

function markDeploymentReturned(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.markReturned(payload && payload.deploymentId, payload || {}), 'Deployment returned.');
  })();
}

function reconcileDeployment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.reconcileDeployment(payload && payload.deploymentId),
      'Deployment reconciled. Inventory adjusted and booking material cost updated.');
  })();
}

function addDeploymentItem(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.addDeploymentItem(payload && payload.deploymentId, payload || {}), 'Deployment item added.');
  })();
}

function updateDeploymentItem(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.updateDeploymentItem(payload && payload.deploymentId, payload || {}), 'Deployment item updated.');
  })();
}

function addDeploymentEquipment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.addDeploymentEquipment(payload && payload.deploymentId, payload || {}), 'Equipment added to deployment.');
  })();
}

function returnDeploymentEquipment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.returnDeploymentEquipment(payload && payload.deploymentId, payload || {}),
      'Equipment returned and condition captured.');
  })();
}

function closeDeployment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.closeDeployment(payload && payload.deploymentId), 'Deployment closed.');
  })();
}

function setDeploymentChecklistItemDone(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.setChecklistItemDone(payload && payload.checklistItemId, payload && payload.done !== false),
      'Checklist item updated.');
  })();
}

function addDeploymentChecklistItem(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.addChecklistItem(payload && payload.deploymentId, payload || {}), 'Checklist item added.');
  })();
}

function logDeploymentIncident(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.logIncident(payload && payload.deploymentId, payload || {}), 'Incident logged.');
  })();
}

function resolveDeploymentIncident(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      DeploymentService.resolveIncident(payload && payload.incidentId), 'Incident resolved.');
  })();
}