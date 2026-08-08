/**
 * ReportService.gs
 * Report registry and dispatcher (Sprint 7).
 *
 * The registry is the single place that knows which report IDs exist,
 * what they are called, and how to build them. UI and export call this
 * service only - no business logic lives in screens.
 */

var ReportService = (function () {
  'use strict';

  var REPORT_DEFINITIONS = [
    { id: 'cashflow', name: 'Cashflow Report', group: 'finance', supportsDateRange: true, description: 'Cash movement per account from the ledger.' },
    { id: 'income-statement', name: 'Income Statement', group: 'finance', supportsDateRange: true, description: 'Accrual revenue, direct costs, operating expenses, net profit.' },
    { id: 'receivables', name: 'Receivables (Outstanding Balances)', group: 'sales', supportsDateRange: true, description: 'Outstanding receivables with aging buckets.' },
    { id: 'revenue-by-service', name: 'Revenue by Service', group: 'sales', supportsDateRange: true, description: 'Revenue attributed to each service line.' },
    { id: 'revenue-by-package', name: 'Revenue by Package', group: 'sales', supportsDateRange: true, description: 'Revenue grouped by package.' },
    { id: 'booking-profitability', name: 'Booking Profitability', group: 'sales', supportsDateRange: true, description: 'Profit per booking from BookingCosts.' },
    { id: 'expense-breakdown', name: 'Expense Breakdown', group: 'finance', supportsDateRange: true, description: 'Paid expenses grouped by category.' },
    { id: 'inventory-valuation', name: 'Inventory Valuation', group: 'inventory', supportsDateRange: false, description: 'On-hand quantities and weighted-average values.' },
    { id: 'inventory-movements', name: 'Inventory Movements', group: 'inventory', supportsDateRange: true, description: 'Movement ledger with running quantities.' },
    { id: 'low-stock', name: 'Low Stock', group: 'inventory', supportsDateRange: false, description: 'Items at or below their reorder level.' },
    { id: 'equipment-status', name: 'Equipment Status', group: 'operations', supportsDateRange: false, description: 'Equipment registry with book value and maintenance.' },
    { id: 'partner-commissions', name: 'Partner Commissions', group: 'operations', supportsDateRange: false, description: 'Commission register by status.' },
    { id: 'crew-payments', name: 'Crew Payments', group: 'operations', supportsDateRange: false, description: 'Crew pay amounts, paid, and balances.' },
    { id: 'daily-reconciliation', name: 'Daily Cash Reconciliation', group: 'finance', supportsDateRange: true, description: 'Per-account daily reconciliations.' },
    { id: 'cash-conversion-summary', name: 'Cash Conversion Summary', group: 'finance', supportsDateRange: true, description: 'Period cash in/out by type.' }
  ];

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

  /**
   * Report catalog (metadata only - no data).
   */
  function listReports() {
    return REPORT_DEFINITIONS.map(function (def) {
      return {
        id: def.id,
        name: def.name,
        group: def.group,
        supportsDateRange: def.supportsDateRange
      };
    });
  }

  function findDefinition(reportId) {
    for (var i = 0; i < REPORT_DEFINITIONS.length; i++) {
      if (REPORT_DEFINITIONS[i].id === reportId) {
        return REPORT_DEFINITIONS[i];
      }
    }
    return null;
  }

  /**
   * Generates a report.
   * @param {string} reportId - registered report ID.
   * @param {Object} filters { fromDate, toDate, accountId, category, status, ... }
   */
  function run(reportId, filters) {
    assertDatabase();
    ReportPermissionService.requireReportAccess(reportId);

    var payload;
    switch (reportId) {
      case 'cashflow':
        payload = CashReportService.runCashflow(filters || {});
        break;
      case 'income-statement':
        payload = ProfitReportService.runIncomeStatement(filters || {});
        break;
      case 'receivables':
        payload = SalesReportService.runReceivables(filters || {});
        break;
      case 'revenue-by-service':
        payload = SalesReportService.runRevenueByService(filters || {});
        break;
      case 'revenue-by-package':
        payload = SalesReportService.runRevenueByPackage(filters || {});
        break;
      case 'booking-profitability':
        payload = ProfitReportService.runBookingProfitability(filters || {});
        break;
      case 'expense-breakdown':
        payload = ProfitReportService.runExpenseBreakdown(filters || {});
        break;
      case 'inventory-valuation':
        payload = InventoryReportService.runValuation(filters || {});
        break;
      case 'inventory-movements':
        payload = InventoryReportService.runMovements(filters || {});
        break;
      case 'low-stock':
        payload = InventoryReportService.runLowStock(filters || {});
        break;
      case 'equipment-status':
        payload = OperationsReportService.runEquipmentStatus(filters || {});
        break;
      case 'partner-commissions':
        payload = OperationsReportService.runCommissionRegister(filters || {});
        break;
      case 'crew-payments':
        payload = OperationsReportService.runCrewPayments(filters || {});
        break;
      case 'daily-reconciliation':
        payload = CashReportService.runDailyReconciliation(filters || {});
        break;
      case 'cash-conversion-summary':
        payload = CashReportService.runCashConversion(filters || {});
        break;
      default:
        throw ErrorService.create(
          ErrorService.CODES.REPORT_NOT_FOUND,
          'The requested report does not exist: ' + reportId + '.',
          { reportId: reportId },
          ErrorService.CATEGORY_NOT_FOUND
        );
    }

    var def = findDefinition(reportId);
    if (!def) {
      throw ErrorService.create(
        ErrorService.CODES.REPORT_NOT_FOUND,
        'The requested report does not exist: ' + reportId + '.',
        { reportId: reportId },
        ErrorService.CATEGORY_NOT_FOUND
      );
    }

    return {
      reportId: reportId,
      reportName: def.name,
      generatedAt: DateService.nowIso(),
      filters: filters || {},
      payload: payload
    };
  }

  return {
    REPORT_DEFINITIONS: REPORT_DEFINITIONS,
    listReports: listReports,
    findDefinition: findDefinition,
    run: run
  };
})();