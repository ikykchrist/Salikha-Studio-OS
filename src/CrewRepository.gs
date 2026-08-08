/**
 * CrewRepository.gs
 * Sheet access for the crew domain (Sprint 6): Crew, CrewAssignments,
 * CrewPayments. No business rules here.
 *
 * Payment records link one crew payment to one assignment and its cash
 * EXPENSE transaction. Assignments also carry the deployment sign-off
 * state used as a reconciliation gate (docs/BUSINESS_WORKFLOWS.md WF-5).
 */

var CrewRepository = (function () {
  'use strict';

  var SHEET_CREW = 'Crew';
  var SHEET_ASSIGNMENTS = 'CrewAssignments';
  var SHEET_PAYMENTS = 'CrewPayments';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_CREW);
    SheetSchemaService.getSchema(SHEET_ASSIGNMENTS);
    SheetSchemaService.getSchema(SHEET_PAYMENTS);
  }

  /* ------------------- Crew members ------------------- */

  function findById(crewMemberId) {
    return RepositoryService.findById(SHEET_CREW, crewMemberId);
  }

  function countByName(recordName, excludeId) {
    var records = RepositoryService.readAll(SHEET_CREW);
    var cleaned = String(recordName || '').trim().toLowerCase();
    var count = 0;
    for (var i = 0; i < records.length; i++) {
      if (excludeId && String(records[i].crew_member_id) === String(excludeId)) {
        continue;
      }
      if (String(records[i].name || '').trim().toLowerCase() === cleaned) {
        count++;
      }
    }
    return count;
  }

  function listCrew(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_CREW);
    var search = ValidationService.trimSafe(filters.search);
    var activeOnly = filters.activeOnly === true || String(filters.isActive) === 'TRUE';
    var inactiveOnly = filters.inactiveOnly === true;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var isActive = String(r.is_active) !== 'FALSE' && r.is_active !== false;
      if (activeOnly && !isActive) {
        continue;
      }
      if (inactiveOnly && isActive) {
        continue;
      }
      if (search) {
        var haystack = String(r.name || '').toLowerCase() + ' ' + String(r.role_tags || '').toLowerCase();
        if (haystack.indexOf(search.toLowerCase()) === -1) {
          continue;
        }
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
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

  /* ------------------- Assignments ------------------- */

  function findAssignmentById(crewAssignId) {
    return RepositoryService.findById(SHEET_ASSIGNMENTS, crewAssignId);
  }

  function getAssignment(crewAssignId) {
    var record = findAssignmentById(crewAssignId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function listAssignmentsByDeployment(deploymentId) {
    var records = RepositoryService.findByField(SHEET_ASSIGNMENTS, 'deployment_id', deploymentId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return out;
  }

  function listAssignmentsByBooking(bookingId) {
    var records = RepositoryService.findByField(SHEET_ASSIGNMENTS, 'booking_id', bookingId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return out;
  }

  function listAssignments(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_ASSIGNMENTS);
    var bookingId = filters.bookingId;
    var deploymentId = filters.deploymentId;
    var crewMemberId = filters.crewMemberId;
    var payStatus = filters.payStatus;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      if (deploymentId && String(r.deployment_id) !== String(deploymentId)) {
        continue;
      }
      if (crewMemberId && String(r.crew_member_id) !== String(crewMemberId)) {
        continue;
      }
      if (payStatus && String(r.pay_status) !== String(payStatus)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return out;
  }

  /* ------------------- Crew payments ------------------- */

  function findCrewPaymentById(crewPaymentId) {
    return RepositoryService.findById(SHEET_PAYMENTS, crewPaymentId);
  }

  function getCrewPayment(crewPaymentId) {
    var record = findCrewPaymentById(crewPaymentId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function listCrewPaymentsByAssignment(crewAssignId) {
    var records = RepositoryService.findByField(SHEET_PAYMENTS, 'crew_assign_id', crewAssignId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return out;
  }

  function listCrewPayments(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_PAYMENTS);
    var crewMemberId = filters.crewMemberId;
    var crewAssignId = filters.crewAssignId;
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || 50, 1), 100);

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (crewMemberId && String(r.crew_member_id) !== String(crewMemberId)) {
        continue;
      }
      if (crewAssignId && String(r.crew_assign_id) !== String(crewAssignId)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.paid_at || '').localeCompare(String(a.paid_at || ''));
    });
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
    findById: findById,
    countByName: countByName,
    listCrew: listCrew,
    findAssignmentById: findAssignmentById,
    getAssignment: getAssignment,
    listAssignmentsByDeployment: listAssignmentsByDeployment,
    listAssignmentsByBooking: listAssignmentsByBooking,
    listAssignments: listAssignments,
    findCrewPaymentById: findCrewPaymentById,
    getCrewPayment: getCrewPayment,
    listCrewPaymentsByAssignment: listCrewPaymentsByAssignment,
    listCrewPayments: listCrewPayments,
    SHEET_CREW: SHEET_CREW,
    SHEET_ASSIGNMENTS: SHEET_ASSIGNMENTS,
    SHEET_PAYMENTS: SHEET_PAYMENTS
  };
})();