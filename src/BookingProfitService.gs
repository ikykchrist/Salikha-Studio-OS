/**
 * BookingProfitService.gs
 * Booking profitability (Sprint 4): one BookingCosts record per booking,
 * recomputed on every cost-bucket change.
 *
 * Formulas (docs/FINANCIAL_RULES.md §13):
 *   revenueTotal      booking gross amount (authoritative pricing snapshot)
 *   directCostTotal   costMaterial + costTransport + costMeals + costCrew
 *                     + costCommission + costOtherDirect
 *   grossProfit       revenueTotal - directCostTotal
 *   allocOpsCost      operatingExpenses(eventMonth) x bookingRevenue /
 *                     totalRevenue(eventMonth)  [0 when allocation off]
 *   netProfit         grossProfit - allocOpsCost
 *   profitMarginPct   netProfit / revenueTotal x 100 (0 when revenue <= 0)
 *
 * Only PAID OPERATING expenses enter the allocation pool. Direct costs
 * come from PAID DIRECT expenses this sprint (material arrives with
 * deployments in a later sprint).
 */

var BookingProfitService = (function () {
  'use strict';

  var BUCKETS = ['material', 'transport', 'meals', 'crew', 'commission', 'other'];

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
   * Finds a booking's cost record by bookingId (1:1).
   */
  function findByBookingId(bookingId) {
    return RepositoryService.findByField(SheetSchemaService.SHEET_BOOKING_COSTS, 'booking_id', bookingId)[0] || null;
  }

  /**
   * The category name -> cost bucket mapping. Centralized here; the
   * expense service holds the same map so category names never diverge.
   */
  function bucketForCategory(categoryName) {
    var name = String(categoryName || '').trim();
    switch (name) {
      case 'Transportation':
        return 'transport';
      case 'Crew Meals':
        return 'meals';
      case 'General Supplies':
      case 'Office Supplies':
      case 'Marketing':
      case 'Miscellaneous Operating Expense':
        return 'other';
      default:
        return 'other';
    }
  }

  function isPaidOperatingExpense(r) {
    return String(r.cost_type) === 'OPERATING' &&
      String(r.approval_status) === 'PAID' &&
      !(r.voided_at && String(r.voided_at) !== '');
  }

  function isPaidDirectExpense(r) {
    return String(r.cost_type) === 'DIRECT' &&
      String(r.approval_status) === 'PAID' &&
      !(r.voided_at && String(r.voided_at) !== '');
  }

  /**
   * Collects the direct-cost buckets for one booking from paid,
   * non-voided DIRECT expenses (this sprint: transport, meals, other;
   * material/crew/commission arrive with later workflows).
   */
  function collectDirectCosts(bookingId, expenseRecords, categoryMap) {
    var costs = { material: 0, transport: 0, meals: 0, crew: 0, commission: 0, other: 0 };
    for (var i = 0; i < expenseRecords.length; i++) {
      var r = expenseRecords[i];
      if (String(r.booking_id) !== String(bookingId) || !isPaidDirectExpense(r)) {
        continue;
      }
      var bucket = bucketForCategory(categoryMap[String(r.category_id || '')] || '');
      costs[bucket] = BookingPricingService.round2(costs[bucket] + Number(r.net_amount || 0));
    }
    return costs;
  }

  /**
   * Month key of a booking's event date (YYYY-MM). Falls back to the
   * booking creation month when no event date is set.
   */
  function eventMonthKey(booking) {
    var dateStr = String(booking.event_date || '').substring(0, 10);
    if (!dateStr) {
      dateStr = String(booking.created_at || '').substring(0, 10);
    }
    return dateStr.substring(0, 7);
  }

  /**
   * Operating cost allocation per policy (FINANCIAL_RULES §12):
   * operatingExpenses(period) x (bookingRevenue / totalRevenue(period)).
   * 0 when the ALLOCATE_OPERATING_COSTS setting is off, when the
   * period has no operating expenses, or when total revenue is 0.
   */
  function computeAllocation(booking, revenueTotal, monthKey, expenseRecords, bookingRecords) {
    if (!SettingsService.isAllocateOperatingCosts()) {
      return 0;
    }
    var operatingTotal = 0;
    for (var e = 0; e < expenseRecords.length; e++) {
      var r = expenseRecords[e];
      if (!isPaidOperatingExpense(r)) {
        continue;
      }
      var expMonth = String(r.expense_date || '').substring(0, 7);
      if (expMonth === monthKey) {
        operatingTotal = BookingPricingService.round2(operatingTotal + Number(r.net_amount || 0));
      }
    }
    if (operatingTotal <= 0) {
      return 0;
    }
    var totalRevenue = 0;
    for (var b = 0; b < bookingRecords.length; b++) {
      var bk = bookingRecords[b];
      if (eventMonthKey(bk) === monthKey) {
        totalRevenue = BookingPricingService.round2(totalRevenue + Number(bk.gross_booking_amount || 0));
      }
    }
    if (totalRevenue <= 0) {
      return 0;
    }
    return BookingPricingService.round2(operatingTotal * (revenueTotal / totalRevenue));
  }

  /**
   * Recomputes and stores the BookingCosts snapshot for one booking.
   * Upserts the single 1:1 row. Returns the public record.
   */
  function recalculateBookingProfitability(bookingId) {
    assertDatabase();
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();

      var expenseRecords = RepositoryService.readAll(ExpenseRepository.SHEET_EXPENSES);
      var categoryRecords = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
      var categoryMap = {};
      for (var c = 0; c < categoryRecords.length; c++) {
        categoryMap[String(categoryRecords[c].category_id)] = categoryRecords[c].category_name;
      }
      var bookingRecords = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);

      var revenueTotal = BookingPricingService.round2(Number(booking.gross_booking_amount || 0));
      var costs = collectDirectCosts(bookingId, expenseRecords, categoryMap);
      var directCostTotal = BookingPricingService.round2(
        costs.material + costs.transport + costs.meals + costs.crew + costs.commission + costs.other);
      var grossProfit = BookingPricingService.round2(revenueTotal - directCostTotal);
      var monthKey = eventMonthKey(booking);
      var allocOpsCost = computeAllocation(booking, revenueTotal, monthKey, expenseRecords, bookingRecords);
      var netProfit = BookingPricingService.round2(grossProfit - allocOpsCost);
      var profitMarginPct = revenueTotal > 0 ? BookingPricingService.round2((netProfit / revenueTotal) * 100) : 0;

      var patch = {
        booking_id: bookingId,
        revenue_subtotal: BookingPricingService.round2(Number(booking.gross_booking_amount || 0)),
        discount_amount: 0,
        tax_amount: 0,
        revenue_total: revenueTotal,
        cost_material: costs.material,
        cost_transport: costs.transport,
        cost_meals: costs.meals,
        cost_crew: costs.crew,
        cost_commission: costs.commission,
        cost_other_direct: costs.other,
        direct_cost_total: directCostTotal,
        gross_profit: grossProfit,
        alloc_ops_cost: allocOpsCost,
        net_profit: netProfit,
        profit_margin_pct: profitMarginPct,
        recalculated_at: now,
        updated_at: now,
        updated_by: actor.userId
      };

      var existing = findByBookingId(bookingId);
      if (existing) {
        patch.version = Number(existing.version || 1) + 1;
        RepositoryService.updateById(SheetSchemaService.SHEET_BOOKING_COSTS, existing.booking_cost_id, patch);
      } else {
        var bookingCostId = IdService.generateId('BKC');
        patch.booking_cost_id = bookingCostId;
        patch.created_at = now;
        patch.created_by = actor.userId;
        RepositoryService.appendRecord(SheetSchemaService.SHEET_BOOKING_COSTS, patch);
      }

      AuditService.info(AuditService.ACTIONS.BOOKING_COSTS_RECALCULATED, 'Bookings', bookingId,
        'Recalculated profitability: revenue ' + revenueTotal.toFixed(2) + ', direct ' +
        directCostTotal.toFixed(2) + ', gross ' + grossProfit.toFixed(2) + ', alloc ' +
        allocOpsCost.toFixed(2) + ', net ' + netProfit.toFixed(2) + ' (' + profitMarginPct.toFixed(2) + '%).');
      return getBookingProfitability(bookingId);
    }, 'booking-costs-recalc');
  }

  /**
   * Reads a booking's profitability snapshot. When none exists yet,
   * returns a computed view without persisting (read-only path).
   */
  function getBookingProfitability(bookingId) {
    var existing = findByBookingId(bookingId);
    if (existing) {
      return RepositoryService.toPublicRecord(existing);
    }
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      return null;
    }
    return {
      bookingCostId: '',
      bookingId: bookingId,
      revenueSubtotal: BookingPricingService.round2(Number(booking.gross_booking_amount || 0)),
      discountAmount: 0,
      taxAmount: 0,
      revenueTotal: BookingPricingService.round2(Number(booking.gross_booking_amount || 0)),
      costMaterial: 0,
      costTransport: 0,
      costMeals: 0,
      costCrew: 0,
      costCommission: 0,
      costOtherDirect: 0,
      directCostTotal: 0,
      grossProfit: BookingPricingService.round2(Number(booking.gross_booking_amount || 0)),
      allocOpsCost: 0,
      netProfit: BookingPricingService.round2(Number(booking.gross_booking_amount || 0)),
      profitMarginPct: 0,
      persisted: false
    };
  }

  /**
   * Applies deployment material cost to the booking's cost snapshot.
   * The material bucket is filled from deployment reconciliation
   * (consumedQty x unit cost). Recomputes gross/net/margin without
   * touching the other five cost buckets. Idempotent.
   */
  function applyDeploymentMaterialCost(bookingId, deploymentMaterialCost) {
    assertDatabase();
    var booking = BookingRepository.findById(bookingId);
    if (!booking) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var amount = BookingPricingService.round2(Number(deploymentMaterialCost || 0));
    if (amount < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Material cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var existing = findByBookingId(bookingId);
      if (!existing) {
        /* First-ever snapshot: initialize the other buckets then adjust. */
        recalculateBookingProfitability(bookingId);
        existing = findByBookingId(bookingId);
      }
      if (!existing) {
        throw ErrorService.create(ErrorService.CODES.BOOKING_COSTS_DUPLICATE, 'The booking cost snapshot could not be initialized.', null, ErrorService.CATEGORY_CONFLICT);
      }
      var revenueTotal = BookingPricingService.round2(Number(booking.gross_booking_amount || 0));
      var material = amount;
      var transport = Number(existing.cost_transport || 0);
      var meals = Number(existing.cost_meals || 0);
      var crew = Number(existing.cost_crew || 0);
      var commission = Number(existing.cost_commission || 0);
      var other = Number(existing.cost_other_direct || 0);
      var directCostTotal = BookingPricingService.round2(material + transport + meals + crew + commission + other);
      var grossProfit = BookingPricingService.round2(revenueTotal - directCostTotal);
      var allocOpsCost = Number(existing.alloc_ops_cost || 0);
      var netProfit = BookingPricingService.round2(grossProfit - allocOpsCost);
      var profitMarginPct = revenueTotal > 0 ? BookingPricingService.round2((netProfit / revenueTotal) * 100) : 0;

      var patch = {
        cost_material: material,
        direct_cost_total: directCostTotal,
        gross_profit: grossProfit,
        alloc_ops_cost: allocOpsCost,
        net_profit: netProfit,
        profit_margin_pct: profitMarginPct,
        recalculated_at: now,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(existing.version || 1) + 1
      };
      RepositoryService.updateById(SheetSchemaService.SHEET_BOOKING_COSTS, existing.booking_cost_id, patch);
      AuditService.info(AuditService.ACTIONS.BOOKING_COSTS_RECALCULATED, 'Bookings', bookingId,
        'Deployment material cost applied: material ' + material.toFixed(2) + ', direct ' +
        directCostTotal.toFixed(2) + ', gross ' + grossProfit.toFixed(2) + '.');
      return getBookingProfitability(bookingId);
    }, 'booking-costs-material');
  }

  /**
   * Recalculates profitability for every booking (used when allocation
   * settings change). Returns the number of bookings refreshed.
   */
  function recalculateAllBookings() {
    assertDatabase();
    var bookings = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var count = 0;
    for (var i = 0; i < bookings.length; i++) {
      recalculateBookingProfitability(bookings[i].booking_id);
      count++;
    }
    return { recalculated: count };
  }

  /**
   * Recalculates profitability only for bookings whose event month
   * matches the given month key (YYYY-MM). Used when an operating
   * expense in that month is paid or voided, so allocation snapshots
   * stay fresh without a full-table sweep.
   */
  function recalculateForMonth(monthKey) {
    assertDatabase();
    var bookings = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var count = 0;
    var target = String(monthKey || '').substring(0, 7);
    if (!target) {
      return { recalculated: 0, month: '' };
    }
    for (var i = 0; i < bookings.length; i++) {
      if (eventMonthKey(bookings[i]) === target) {
        recalculateBookingProfitability(bookings[i].booking_id);
        count++;
      }
    }
    return { recalculated: count, month: target };
  }

  return {
    assertDatabase: assertDatabase,
    findByBookingId: findByBookingId,
    bucketForCategory: bucketForCategory,
    recalculateBookingProfitability: recalculateBookingProfitability,
    applyDeploymentMaterialCost: applyDeploymentMaterialCost,
    getBookingProfitability: getBookingProfitability,
    recalculateAllBookings: recalculateAllBookings,
    recalculateForMonth: recalculateForMonth,
    BUCKETS: BUCKETS.slice(0)
  };
})();