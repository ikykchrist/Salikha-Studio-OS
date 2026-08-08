/**
 * ProductionController.gs
 * Server entry points for production preparation (Sprint 6): tasks and
 * the production-to-deployment handoff. Production never posts cash and
 * never moves inventory.
 */

function getTasks(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(TaskService.listTasks(filters || {}), 'Tasks retrieved.');
  })();
}

function getTask(taskId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(TaskService.getTask(taskId), 'Task retrieved.');
  })();
}

function createTask(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(TaskService.createTask(payload || {}), 'Task created.');
  })();
}

function updateTask(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(TaskService.updateTask(payload || {}), 'Task updated.');
  })();
}

function completeTask(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      TaskService.completeTask(payload && payload.taskId), 'Task completed.');
  })();
}

function reopenTask(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      TaskService.reopenTask(payload && payload.taskId), 'Task reopened.');
  })();
}

function cancelTask(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      TaskService.cancelTask(payload && payload.taskId, payload && payload.reason), 'Task cancelled.');
  })();
}

function getProductionOverview(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      ProductionService.getProductionOverview(bookingId), 'Production overview retrieved.');
  })();
}

function planProduction(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      ProductionService.planProduction(bookingId), 'Production plan created. No cash or inventory moved.');
  })();
}

function markReadyToDeploy(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      ProductionService.markReadyToDeploy(bookingId), 'Booking marked production-ready. Deployment created.');
  })();
}