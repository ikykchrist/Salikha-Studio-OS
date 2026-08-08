/**
 * TaskRepository.gs
 * Sheet access for production/operations tasks (Sprint 6).
 * No business rules; TaskService owns the production task lifecycle.
 */

var TaskRepository = (function () {
  'use strict';

  var SHEET_TASKS = 'Tasks';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_TASKS);
  }

  function findTaskById(taskId) {
    return RepositoryService.findById(SHEET_TASKS, taskId);
  }

  function getTask(taskId) {
    var record = findTaskById(taskId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists tasks with filters and pagination.
   */
  function listTasks(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_TASKS);
    var bookingId = filters.bookingId;
    var taskType = filters.taskType;
    var status = filters.status;
    var search = ClientRepository.normalizeSearch(filters.search);

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      if (taskType && String(r.task_type) !== String(taskType)) {
        continue;
      }
      if (status && String(r.status) !== String(status)) {
        continue;
      }
      if (search) {
        var haystack = [r.title, r.description].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      var cmp = String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return cmp === 0 ? String(a.task_id || '').localeCompare(String(b.task_id || '')) : cmp;
    });
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || 50, 1), 100);
    var total = out.length;
    var start = (page - 1) * pageSize;
    return {
      items: out.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  return {
    assertDatabase: assertDatabase,
    findTaskById: findTaskById,
    getTask: getTask,
    listTasks: listTasks,
    SHEET_TASKS: SHEET_TASKS
  };
})();