/**
 * TaskService.gs
 * Production and operations tasks (Sprint 6).
 *
 * Tasks support the WF-4 production flow: a booking's production
 * checklist accumulates PRODUCTION / TO_DO / CHECKLIST items that must
 * reach DONE before the deployment can be created. Tasks are soft-state
 * only: they never post cash and never move inventory.
 */

var TaskService = (function () {
  'use strict';

  var TYPE_PRODUCTION = 'PRODUCTION';
  var TYPE_TO_DO = 'TO_DO';
  var TYPE_CHECKLIST = 'CHECKLIST';
  var TASK_TYPES = [TYPE_PRODUCTION, TYPE_TO_DO, TYPE_CHECKLIST];

  var STATUS_OPEN = 'OPEN';
  var STATUS_DONE = 'DONE';
  var STATUS_CANCELLED = 'CANCELLED';
  var STATUSES = [STATUS_OPEN, STATUS_DONE, STATUS_CANCELLED];

  function assertDatabase() {
    TaskRepository.assertDatabase();
  }

  function assertBooking(bookingId) {
    if (!ValidationService.trimSafe(bookingId)) {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'A booking is required for production tasks.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(
        ErrorService.CODES.BOOKING_NOT_FOUND,
        'The booking was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return booking;
  }

  function requireTask(taskId) {
    var record = TaskRepository.findTaskById(taskId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.TASK_NOT_FOUND,
        'The task was not found.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    return record;
  }

  function validateTaskPayload(payload) {
    var bookingId = ValidationService.trimSafe(payload.bookingId);
    assertBooking(bookingId);
    var type = String(payload.taskType || TYPE_TO_DO).toUpperCase();
    var typeCheck = ValidationService.isEnum(type, TASK_TYPES, 'Task type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var titleCheck = ValidationService.isNonEmptyString(payload.title, 'Task title', 300);
    if (!titleCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, titleCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    return {
      bookingId: bookingId,
      taskType: type,
      title: ValidationService.trimSafe(payload.title),
      description: ValidationService.trimSafe(payload.description),
      isRequired: payload.isRequired === true || String(payload.isRequired) === 'TRUE' || String(payload.isRequired) === 'true',
      assigneeId: ValidationService.trimSafe(payload.assigneeId),
      dueDate: payload.dueDate || ''
    };
  }

  function toBool(value) {
    return value === true || String(value) === 'TRUE';
  }

  function createTask(payload) {
    assertDatabase();
    var data = validateTaskPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var taskId = IdService.generateId('TSK');
      RepositoryService.appendRecord(TaskRepository.SHEET_TASKS, {
        task_id: taskId,
        booking_id: data.bookingId,
        task_type: data.taskType,
        title: data.title,
        description: data.description,
        is_required: data.isRequired ? 'TRUE' : 'FALSE',
        assignee_id: data.assigneeId,
        due_date: data.dueDate,
        status: STATUS_OPEN,
        done_at: '',
        done_by: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.TASK_CREATED, 'Tasks', taskId,
        'Task "' + data.title + '" created for booking ' + data.bookingId + '.');
      return enrichTask(taskId);
    }, 'task-create');
  }

  /**
   * Edits an OPEN task's mutable fields. DONE/CANCELLED tasks are
   * immutable (corrections reopen first).
   */
  function updateTask(payload) {
    assertDatabase();
    var record = requireTask(payload.taskId);
    if (String(record.status) !== STATUS_OPEN) {
      throw ErrorService.create(ErrorService.CODES.TASK_INVALID_STATUS_TRANSITION,
        'Only OPEN tasks can be edited.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var data = validateTaskPayload(payload);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(TaskRepository.SHEET_TASKS, payload.taskId, {
        booking_id: data.bookingId,
        task_type: data.taskType,
        title: data.title,
        description: data.description,
        is_required: data.isRequired ? 'TRUE' : 'FALSE',
        assignee_id: data.assigneeId,
        due_date: data.dueDate,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.TASK_UPDATED, 'Tasks', payload.taskId,
        'Task "' + data.title + '" updated.');
      return enrichTask(payload.taskId);
    }, 'task-update');
  }

  /**
   * Marks a task DONE (required before production readiness).
   */
  function completeTask(taskId) {
    assertDatabase();
    var record = requireTask(taskId);
    if (String(record.status) === STATUS_DONE) {
      return enrichTask(taskId);
    }
    if (String(record.status) !== STATUS_OPEN) {
      throw ErrorService.create(ErrorService.CODES.TASK_INVALID_STATUS_TRANSITION,
        'Only OPEN tasks can be completed.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(TaskRepository.SHEET_TASKS, taskId, {
        status: STATUS_DONE,
        done_at: now,
        done_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.TASK_COMPLETED, 'Tasks', taskId,
        'Task "' + record.title + '" completed.');
      return enrichTask(taskId);
    }, 'task-complete');
  }

  /**
   * Reopens a DONE task when a correction is needed. Recorded reason
   * keeps the audit trail complete.
   */
  function reopenTask(taskId, reason) {
    assertDatabase();
    var record = requireTask(taskId);
    if (String(record.status) === STATUS_OPEN) {
      return enrichTask(taskId);
    }
    if (String(record.status) !== STATUS_DONE) {
      throw ErrorService.create(ErrorService.CODES.TASK_INVALID_STATUS_TRANSITION,
        'Only DONE tasks can be reopened.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(TaskRepository.SHEET_TASKS, taskId, {
        status: STATUS_OPEN,
        done_at: '',
        done_by: '',
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.TASK_REOPENED, 'Tasks', taskId,
        'Task "' + record.title + '" reopened.' + (ValidationService.trimSafe(reason) ? ' Reason: ' + ValidationService.trimSafe(reason) : ''));
      return enrichTask(taskId);
    }, 'task-reopen');
  }

  /**
   * Cancels an OPEN task. Cancelled tasks no longer count toward
   * production readiness; DONE tasks cannot be cancelled.
   */
  function cancelTask(taskId, reason) {
    assertDatabase();
    var record = requireTask(taskId);
    if (String(record.status) === STATUS_CANCELLED) {
      return enrichTask(taskId);
    }
    if (String(record.status) !== STATUS_OPEN) {
      throw ErrorService.create(ErrorService.CODES.TASK_INVALID_STATUS_TRANSITION,
        'Only OPEN tasks can be cancelled.', null, ErrorService.CATEGORY_CONFLICT);
    }
    if (!ValidationService.trimSafe(reason)) {
      throw ErrorService.create(ErrorService.CODES.TASK_CANCEL_REASON_REQUIRED,
        'A reason is required to cancel a task.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(TaskRepository.SHEET_TASKS, taskId, {
        status: STATUS_CANCELLED,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.TASK_CANCELLED, 'Tasks', taskId,
        'Task "' + record.title + '" cancelled. Reason: ' + ValidationService.trimSafe(reason));
      return enrichTask(taskId);
    }, 'task-cancel');
  }

  function enrichTask(taskId) {
    assertDatabase();
    return TaskRepository.getTask(taskId);
  }

  function getTask(taskId) {
    assertDatabase();
    requireTask(taskId);
    return enrichTask(taskId);
  }

  function listTasks(filters) {
    assertDatabase();
    return TaskRepository.listTasks(filters || {});
  }

  /**
   * Production readiness summary for one booking: required vs done
   * counts. A deployment may only be created from `markReadyToDeploy`
   * when required === requiredDone and every required item is DONE.
   */
  function productionReadiness(bookingId) {
    assertDatabase();
    var result = TaskRepository.listTasks({ bookingId: bookingId, pageSize: 1000 });
    var required = 0;
    var requiredDone = 0;
    var open = 0;
    for (var i = 0; i < result.items.length; i++) {
      var t = result.items[i];
      if (toBool(t.isRequired)) {
        required++;
        if (String(t.status) === STATUS_DONE) {
          requiredDone++;
        }
      }
      if (String(t.status) === STATUS_OPEN) {
        open++;
      }
    }
    var ready = required > 0 && requiredDone === required && open === 0;
    return {
      bookingId: bookingId,
      total: result.items.length,
      required: required,
      requiredDone: requiredDone,
      open: open,
      ready: ready
    };
  }

  return {
    createTask: createTask,
    updateTask: updateTask,
    completeTask: completeTask,
    reopenTask: reopenTask,
    cancelTask: cancelTask,
    getTask: getTask,
    listTasks: listTasks,
    productionReadiness: productionReadiness,
    TASK_TYPES: TASK_TYPES,
    STATUSES: STATUSES,
    STATUS_OPEN: STATUS_OPEN,
    STATUS_DONE: STATUS_DONE,
    STATUS_CANCELLED: STATUS_CANCELLED,
    TYPE_PRODUCTION: TYPE_PRODUCTION,
    TYPE_TO_DO: TYPE_TO_DO,
    TYPE_CHECKLIST: TYPE_CHECKLIST
  };
})();