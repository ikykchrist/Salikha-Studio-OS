/**
 * ExpenseRepository.gs
 * Sheet access and search for Expenses (Sprint 4). No business
 * decisions here; ExpenseService enforces lifecycle rules.
 */

var ExpenseRepository = (function () {
  'use strict';

  var SHEET_EXPENSES = 'Expenses';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    // Runtime guard: constants must match the registered schema.
    SheetSchemaService.getSchema(SHEET_EXPENSES);
  }

  function findExpenseById(expenseId) {
    return RepositoryService.findById(SHEET_EXPENSES, expenseId);
  }

  function getExpense(expenseId) {
    var record = findExpenseById(expenseId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists expenses with filters and pagination.
   * @param {Object} filters status, costType, categoryId, bookingId,
   *   cashAccountId, search, fromDate, toDate, page, pageSize
   */
  function listExpenses(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_EXPENSES);
    var search = ClientRepository.normalizeSearch(filters.search);
    var status = filters.status;
    var costType = filters.costType;
    var categoryId = filters.categoryId;
    var bookingId = filters.bookingId;
    var cashAccountId = filters.cashAccountId;
    var fromDate = filters.fromDate;
    var toDate = filters.toDate;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (status && String(r.approval_status) !== String(status)) {
        continue;
      }
      if (costType && String(r.cost_type) !== String(costType)) {
        continue;
      }
      if (categoryId && String(r.category_id) !== String(categoryId)) {
        continue;
      }
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      if (cashAccountId && String(r.paid_from_account_id) !== String(cashAccountId)) {
        continue;
      }
      if (fromDate && String(r.expense_date) < String(fromDate)) {
        continue;
      }
      if (toDate && String(r.expense_date) > String(toDate)) {
        continue;
      }
      if (search) {
        var haystack = [r.expense_code, r.expense_date, r.description, r.supplier_name, r.booking_id].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.expenseDate || '').localeCompare(String(a.expenseDate || ''));
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
    findExpenseById: findExpenseById,
    getExpense: getExpense,
    listExpenses: listExpenses,
    SHEET_EXPENSES: SHEET_EXPENSES
  };
})();
