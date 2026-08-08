/**
 * OperationsReportService.gs
 * Operations-facing reports (Sprint 7).
 *
 * R12  Equipment Status (book value, depreciation, maintenance due)
 * R13  Partner Commission Register
 * R14  Crew Payments Register
 *
 * Depreciation is straight-line and informational only (never a cash
 * transaction - docs/FINANCIAL_RULES.md Sec 11).
 */

var OperationsReportService = (function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* R12 - Equipment status                                             */
  /* ------------------------------------------------------------------ */

  function monthsBetween(fromIso, toIso) {
    var from = new Date(fromIso + 'T00:00:00');
    var to = new Date(toIso + 'T00:00:00');
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
      return 0;
    }
    return (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth());
  }

  function daysBetween(fromIso, toIso) {
    var ms = new Date(toIso + 'T00:00:00') - new Date(fromIso + 'T00:00:00');
    return Math.round(ms / (24 * 3600 * 1000));
  }

  function runEquipmentStatus(filters) {
    filters = filters || {};
    var list = EquipmentRepository.listEquipment({ status: filters.status, category: filters.category, pageSize: 0 });
    var today = ReportFilterService.today();

    var movementRecords = RepositoryService.readAll(SheetSchemaService.SHEET_EQUIPMENT_MOVEMENTS);
    var movementsByEquipment = {};
    for (var mv = 0; mv < movementRecords.length; mv++) {
      var mk = String(movementRecords[mv].equipment_id);
      movementsByEquipment[mk] = movementsByEquipment[mk] || [];
      movementsByEquipment[mk].push(movementRecords[mv]);
    }

    var rows = [];
    for (var i = 0; i < list.items.length; i++) {
      var eq = list.items[i];
      var purchasePrice = Number(eq.purchasePrice || 0);
      var usefulLife = Number(eq.usefulLifeMonths || 0);
      var monthlyDep = usefulLife > 0 ? ReportFilterService.round2(purchasePrice / usefulLife) : 0;
      var monthsOwned = eq.purchaseDate ? monthsBetween(eq.purchaseDate, today) : 0;
      var accumulated = Math.min(ReportFilterService.round2(monthlyDep * monthsOwned), purchasePrice);
      var bookValue = ReportFilterService.round2(purchasePrice - accumulated);

      var movements = movementsByEquipment[String(eq.equipmentId)] || [];
      var lastMaintenance = '';
      for (var m = 0; m < movements.length; m++) {
        var row = movements[m];
        if (String(row.movement_type) === 'MAINTENANCE' || String(row.movement_type) === 'REPAIR') {
          var performed = String(row.performed_at || row.created_at || '');
          if (performed > lastMaintenance) {
            lastMaintenance = performed;
          }
        }
      }
      var lastMaintenanceDate = ReportFilterService.datePart(lastMaintenance);

      rows.push({
        equipmentId: eq.equipmentId,
        name: eq.name,
        category: eq.category || '',
        status: eq.status || '',
        condition: eq.condition || '',
        serialNumber: eq.serialNumber || '',
        purchaseDate: eq.purchaseDate || '',
        purchasePrice: purchasePrice,
        usefulLifeMonths: usefulLife,
        monthlyDepreciation: monthlyDep,
        monthsOwned: monthsOwned,
        accumulatedDepreciation: accumulated,
        bookValue: bookValue,
        lastMaintenance: lastMaintenanceDate,
        maintenanceDue: !lastMaintenanceDate || daysBetween(lastMaintenanceDate, today) > 30
      });
    }

    rows.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    var totalBookValue = 0;
    var inService = 0;
    for (var r = 0; r < rows.length; r++) {
      totalBookValue += rows[r].bookValue;
      if (String(rows[r].status) === 'IN_SERVICE') {
        inService++;
      }
    }

    return {
      report: 'R12',
      rows: rows,
      summary: {
        equipmentCount: rows.length,
        inServiceCount: inService,
        totalBookValue: ReportFilterService.round2(totalBookValue)
      },
      scope: {
        dateRange: 'As of today',
        transactionTypes: 'Equipment registry only. Depreciation is report-informational (straight-line); it creates no cash transaction. Maintenance due = no MAINTENANCE/REPAIR movement recorded, or the latest one older than 30 days.'
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* R13 - Partner commissions                                          */
  /* ------------------------------------------------------------------ */

  function runCommissionRegister(filters) {
    filters = filters || {};
    var list = PartnerRepository.listCommissions({ bookingId: filters.bookingId, partnerId: filters.partnerId, status: filters.status, pageSize: 0 });

    var partners = {};
    var partnerRecords = RepositoryService.readAll(SheetSchemaService.SHEET_PARTNERS);
    for (var p = 0; p < partnerRecords.length; p++) {
      partners[String(partnerRecords[p].partner_id)] = partnerRecords[p];
    }
    var bookings = {};
    var bookingRecords = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    for (var b = 0; b < bookingRecords.length; b++) {
      bookings[String(bookingRecords[b].booking_id)] = bookingRecords[b];
    }

    var rows = [];
    for (var i = 0; i < list.items.length; i++) {
      var c = list.items[i];
      var partner = partners[String(c.partnerId)];
      var booking = bookings[String(c.bookingId)];
      if (!booking || !ReportFilterService.isBookingEligible(booking)) {
        continue;
      }
      rows.push({
        commissionId: c.commissionId,
        bookingId: c.bookingId,
        bookingTitle: booking ? (booking.booking_title || booking.booking_code || '') : '',
        bookingStatus: booking ? (booking.booking_status || '') : '',
        partnerId: c.partnerId,
        partnerName: partner ? (partner.name || '') : '',
        partnerType: partner ? (partner.partner_type || '') : '',
        baseAmount: ReportFilterService.round2(Number(c.baseAmount || 0)),
        ratePct: ReportFilterService.round2(Number(c.ratePct || 0)),
        commissionAmount: ReportFilterService.round2(Number(c.commissionAmount || 0)),
        status: c.status || '',
        settledAt: c.settledAt || ''
      });
    }

    rows.sort(function (a, b) {
      return String(a.partnerName || '').localeCompare(String(b.partnerName || ''));
    });

    var totals = { pending: 0, due: 0, paid: 0 };
    for (var t = 0; t < rows.length; t++) {
      var bucket = String(rows[t].status).toLowerCase();
      if (totals[bucket] !== undefined) {
        totals[bucket] += rows[t].commissionAmount;
      }
    }

    return {
      report: 'R13',
      rows: rows,
      totals: {
        pending: ReportFilterService.round2(totals.pending),
        due: ReportFilterService.round2(totals.due),
        paid: ReportFilterService.round2(totals.paid),
        total: ReportFilterService.round2(totals.pending + totals.due + totals.paid)
      },
      scope: {
        dateRange: 'As of today',
        transactionTypes: 'PartnerCommissions register (all statuses) on bookings whose status is confirmed or later (CONFIRMED/PREPARING/READY/IN_PROGRESS/COMPLETED/ARCHIVED). PAID commissions are also direct booking costs via BookingCosts.costCommission.'
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* R14 - Crew payments                                                */
  /* ------------------------------------------------------------------ */

  function runCrewPayments(filters) {
    filters = filters || {};
    var assignments = CrewRepository.listAssignments({ crewMemberId: filters.crewMemberId, payStatus: filters.payStatus, bookingId: filters.bookingId });
    var paymentRecords = RepositoryService.readAll(SheetSchemaService.SHEET_CREW_PAYMENTS);

    var paidByAssignment = {};
    for (var i = 0; i < paymentRecords.length; i++) {
      var cp = paymentRecords[i];
      if (cp.voided_at && String(cp.voided_at) !== '') {
        continue;
      }
      var key = String(cp.crew_assign_id);
      paidByAssignment[key] = (paidByAssignment[key] || 0) + Number(cp.amount || 0);
    }

    var crew = [];
    var crewRecords = RepositoryService.readAll(SheetSchemaService.SHEET_CREW);
    var crewById = {};
    for (var m = 0; m < crewRecords.length; m++) {
      crewById[String(crewRecords[m].crew_member_id)] = crewRecords[m];
    }
    var bookings = {};
    var bookingRecords = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    for (var x = 0; x < bookingRecords.length; x++) {
      bookings[String(bookingRecords[x].booking_id)] = bookingRecords[x];
    }

    var rows = [];
    for (var a = 0; a < assignments.length; a++) {
      var asgn = assignments[a];
      var member = crewById[String(asgn.crewMemberId)];
      var booking = bookings[String(asgn.bookingId)];
      if (!booking || !ReportFilterService.isBookingEligible(booking)) {
        continue;
      }
      var amount = Number(asgn.payAmount || 0);
      var paid = ReportFilterService.round2(paidByAssignment[String(asgn.crewAssignId)] || 0);
      rows.push({
        crewMemberId: asgn.crewMemberId,
        crewName: member ? member.name : '',
        crewAssignId: asgn.crewAssignId,
        bookingId: asgn.bookingId || '',
        bookingTitle: booking ? (booking.booking_title || booking.booking_code || '') : '',
        role: asgn.role || '',
        hours: ReportFilterService.round2(Number(asgn.hours || 0)),
        payRate: ReportFilterService.round2(Number(asgn.payRate || 0)),
        payAmount: ReportFilterService.round2(amount),
        paid: paid,
        balance: ReportFilterService.round2(amount - paid),
        payStatus: asgn.payStatus || 'UNPAID'
      });
    }

    rows.sort(function (a, b) {
      return String(a.crewName || '').localeCompare(String(b.crewName || ''));
    });

    var totals = { payAmount: 0, paid: 0, balance: 0 };
    for (var t = 0; t < rows.length; t++) {
      totals.payAmount += rows[t].payAmount;
      totals.paid += rows[t].paid;
      totals.balance += rows[t].balance;
    }

    return {
      report: 'R14',
      rows: rows,
      totals: {
        payAmount: ReportFilterService.round2(totals.payAmount),
        paid: ReportFilterService.round2(totals.paid),
        balance: ReportFilterService.round2(totals.balance)
      },
      scope: {
        dateRange: 'As of today',
        transactionTypes: 'Crew assignments on bookings whose status is confirmed or later, with payments from valid (non-voided) crew payments. Paid crew is paid through EXPENSE cash transactions.'
      }
    };
  }

  return {
    runEquipmentStatus: runEquipmentStatus,
    runCommissionRegister: runCommissionRegister,
    runCrewPayments: runCrewPayments
  };
})();