/**
 * PartnerRepository.gs
 * Sheet access for the partner domain (Sprint 6): Partners and
 * PartnerCommissions. No business rules here.
 *
 * Commissions are created at booking confirmation, promoted to DUE when
 * the event completes, and settled (PAID) through a partner payment that
 * posts an EXPENSE cash transaction.
 */

var PartnerRepository = (function () {
  'use strict';

  var SHEET_PARTNERS = 'Partners';
  var SHEET_COMMISSIONS = 'PartnerCommissions';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    SheetSchemaService.getSchema(SHEET_PARTNERS);
    SheetSchemaService.getSchema(SHEET_COMMISSIONS);
  }

  function findPartnerById(partnerId) {
    return RepositoryService.findById(SHEET_PARTNERS, partnerId);
  }

  function countByName(recordName, excludeId) {
    var records = RepositoryService.readAll(SHEET_PARTNERS);
    var cleaned = String(recordName || '').trim().toLowerCase();
    var count = 0;
    for (var i = 0; i < records.length; i++) {
      if (excludeId && String(records[i].partner_id) === String(excludeId)) {
        continue;
      }
      if (String(records[i].name || '').trim().toLowerCase() === cleaned) {
        count++;
      }
    }
    return count;
  }

  function listPartners(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_PARTNERS);
    var partnerType = filters.partnerType;
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
      if (partnerType && String(r.partner_type) !== String(partnerType)) {
        continue;
      }
      if (search) {
        var haystack = String(r.name || '').toLowerCase();
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

  /* ------------------- Commissions ------------------- */

  function findCommissionById(commissionId) {
    return RepositoryService.findById(SHEET_COMMISSIONS, commissionId);
  }

  function getCommission(commissionId) {
    var record = findCommissionById(commissionId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function findCommissionByBookingAndPartner(bookingId, partnerId) {
    var records = RepositoryService.findByField(SHEET_COMMISSIONS, 'booking_id', bookingId);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.partner_id) === String(partnerId) &&
          !(r.voided_at && String(r.voided_at) !== '')) {
        return r;
      }
    }
    return null;
  }

  function listCommissionsByBooking(bookingId) {
    var records = RepositoryService.findByField(SHEET_COMMISSIONS, 'booking_id', bookingId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    return out;
  }

  function listCommissions(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_COMMISSIONS);
    var bookingId = filters.bookingId;
    var partnerId = filters.partnerId;
    var status = filters.status;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (bookingId && String(r.booking_id) !== String(bookingId)) {
        continue;
      }
      if (partnerId && String(r.partner_id) !== String(partnerId)) {
        continue;
      }
      if (status && String(r.status) !== String(status)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    var page = Math.max(Number(filters.page) || 1, 1);
    var requested = Number(filters.pageSize);
    var pageSize = requested === 0 ? out.length : Math.min(Math.max(requested || 50, 1), 100);
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
    findPartnerById: findPartnerById,
    countByName: countByName,
    listPartners: listPartners,
    findCommissionById: findCommissionById,
    getCommission: getCommission,
    findCommissionByBookingAndPartner: findCommissionByBookingAndPartner,
    listCommissionsByBooking: listCommissionsByBooking,
    listCommissions: listCommissions,
    SHEET_PARTNERS: SHEET_PARTNERS,
    SHEET_COMMISSIONS: SHEET_COMMISSIONS
  };
})();