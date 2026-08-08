/**
 * ExpenseController.gs
 * Server entry points for expenses and booking profitability
 * (Sprint 4). Every expense mutation is authorized and audited.
 */

function getExpenses(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseRepository.listExpenses(filters || {}), 'Expenses retrieved.');
  })();
}

function getExpense(expenseId) {
  return ErrorService.wrap(function () {
    var expense = ExpenseRepository.getExpense(expenseId);
    if (!expense) {
      throw ErrorService.create(ErrorService.CODES.EXPENSE_NOT_FOUND, 'The expense was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (expense.categoryId) {
      var category = FinancialCategoryService.getCategoryRecord(expense.categoryId);
      expense.categoryName = category && category.category_name ? category.category_name : '';
    }
    if (expense.cashTransactionId) {
      expense.cashTransaction = CashTransactionService.getTransaction(expense.cashTransactionId);
    }
    return ResponseService.success(expense, 'Expense retrieved.');
  })();
}

function createExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.createExpense(payload || {}), 'Expense created as draft. No cash moved.');
  })();
}

function updateExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.updateExpense(payload || {}), 'Expense updated.');
  })();
}

function submitExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.submitExpense(payload || {}), 'Expense submitted for approval.');
  })();
}

function approveExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.approveExpense(payload || {}), 'Expense approved.');
  })();
}

function rejectExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.rejectExpense(payload || {}), 'Expense rejected.');
  })();
}

function reopenExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.reopenExpense(payload || {}), 'Expense reopened for rework.');
  })();
}

function payExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.payExpense(payload || {}), 'Expense paid. Cash outflow posted to the ledger.');
  })();
}

function voidExpense(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.voidExpense(payload || {}), 'Expense voided. Cash effect reversed.');
  })();
}

function getExpenseSummary() {
  return ErrorService.wrap(function () {
    return ResponseService.success(ExpenseService.getExpenseSummary(), 'Expense summary retrieved.');
  })();
}

function getBookingProfitability(bookingId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(BookingProfitService.getBookingProfitability(bookingId), 'Booking profitability retrieved.');
  })();
}

function recalculateBookingProfitability(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      BookingProfitService.recalculateBookingProfitability(payload && payload.bookingId),
      'Booking profitability recalculated.');
  })();
}

function getAllocateOperatingCosts() {
  return ErrorService.wrap(function () {
    return ResponseService.success(SettingsService.getBusinessSettings(), 'Business settings retrieved.');
  })();
}

function setAllocateOperatingCosts(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      SettingsService.setAllocateOperatingCosts(payload && payload.enabled),
      'Operating cost allocation setting updated.');
  })();
}