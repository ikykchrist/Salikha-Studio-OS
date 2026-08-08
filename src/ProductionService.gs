/**
 * ProductionService.gs
 * Production preparation (Sprint 6, WF-4).
 *
 * The workflow: task from booking CONFIRMED, production tasks are
 * planned; when the required production tasks reach DONE the booking is
 * production-ready and a single PLANNED EventDeployment is auto-created
 * for it (1:1, idempotent). Production never posts cash and never moves
 * inventory: reconciliation does that work later.
 */

var ProductionService = (function () {
  'use strict';

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

  function requireBooking(bookingId) {
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var status = String(booking.booking_status || '');
    if (status === 'CANCELLED' || status === 'ARCHIVED') {
      throw ErrorService.create(ErrorService.CODES.PRODUCTION_BOOKING_UNAVAILABLE,
        'Production cannot start for a cancelled or archived booking.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return booking;
  }

  /**
   * Plans (or returns the existing) production task set for a booking.
   * One PRODUCTION task per snapshot booking item plus a starter
   * checklist. Idempotent: re-planning returns the existing set and
   * never deletes completed work.
   */
  function planProduction(bookingId) {
    assertDatabase();
    var booking = requireBooking(bookingId);
    var existing = TaskRepository.listTasks({ bookingId: bookingId, pageSize: 1000 });
    if (existing.total > 0) {
      return { planned: false, tasks: existing.items };
    }
    var items = BookingRepository.listItems(bookingId);
    var created = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      created.push(TaskService.createTask({
        bookingId: bookingId,
        taskType: TaskService.TYPE_PRODUCTION,
        title: 'Prepare: ' + String(item.serviceName || item.itemName || 'service'),
        isRequired: true
      }));
    }
    created.push(TaskService.createTask({
      bookingId: bookingId,
      taskType: TaskService.TYPE_CHECKLIST,
      title: 'Verify schedule and crew for ' + (booking.booking_title || bookingId),
      isRequired: false
    }));
    return { planned: true, tasks: created };
  }

  /**
   * Production overview: task progress and whether the deployment has
   * already been created.
   */
  function getProductionOverview(bookingId) {
    assertDatabase();
    requireBooking(bookingId);
    var readiness = TaskService.productionReadiness(bookingId);
    var deployment = DeploymentService.findDeploymentByBooking(bookingId);
    return {
      bookingId: bookingId,
      readiness: readiness,
      deployment: deployment ? {
        deploymentId: deployment.deployment_id || deployment.deploymentId,
        status: deployment.status,
        scheduledDate: deployment.scheduled_date || deployment.scheduledDate
      } : null
    };
  }

  /**
   * Marks a booking production-ready. When the required task set is
   * complete the first call auto-creates the PLANNED deployment and
   * stores the deployment id on the booking. Subsequent calls return the
   * existing deployment (idempotent).
   */
  function markReadyToDeploy(bookingId) {
    assertDatabase();
    var booking = requireBooking(bookingId);
    var existing = DeploymentService.findDeploymentByBooking(bookingId);
    if (existing) {
      /* 1:1 contract: a booking always has at most one deployment; a
         repeat readiness call is a no-op, never a second deployment. */
      return DeploymentService.getDeployment(existing.deployment_id || existing.deploymentId);
    }
    var readiness = TaskService.productionReadiness(bookingId);
    if (!readiness.ready) {
      throw ErrorService.create(ErrorService.CODES.PRODUCTION_NOT_READY,
        'Cannot create the deployment: ' + (readiness.required - readiness.requiredDone) +
        ' required production task(s) are still open.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var deployment = DeploymentService.createDeployment(bookingId, {
      scheduledDate: booking.event_date,
      source: 'production'
    });
    var deploymentId = deployment.deployment_id || deployment.deploymentId;
    RepositoryService.updateById('Bookings', bookingId, {
      production_status: 'READY_TO_DEPLOY',
      deployment_status: 'PLANNED',
      updated_at: DateService.nowIso(),
      updated_by: AuditService.getActor().userId,
      version: Number(booking.version || 1) + 1
    });
    AuditService.info(AuditService.ACTIONS.PRODUCTION_MARKED_READY, 'Bookings', bookingId,
      'Booking marked production-ready; deployment ' + deploymentId + ' created.');
    return DeploymentService.getDeployment(deploymentId);
  }

  /**
   * Convenience used by tests and the UI-triggered flow: plan then mark ready.
   */
  function prepare(bookingId) {
    planProduction(bookingId);
    return markReadyToDeploy(bookingId);
  }

  return {
    planProduction: planProduction,
    getProductionOverview: getProductionOverview,
    markReadyToDeploy: markReadyToDeploy,
    prepare: prepare
  };
})();