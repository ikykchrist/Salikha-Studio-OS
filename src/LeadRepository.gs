/**
 * LeadRepository.gs
 * Sheet access and search for the Leads sheet (Sprint 2).
 * No business decisions here - LeadService owns the rules.
 */

var LeadRepository = (function () {
  'use strict';

  // Plain string: resolved against SheetSchemaService at call time
  // (Apps Script loads files alphabetically).
  var SHEET_LEADS = 'Leads';

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    // Runtime guard: constant must match the registered schema.
    SheetSchemaService.getSchema(SHEET_LEADS);
  }

  function findById(leadId) {
    return RepositoryService.findById(SHEET_LEADS, leadId);
  }

  function getLead(leadId) {
    var record = findById(leadId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /**
   * Lists leads with search, filters, and pagination.
   * Search covers name, organization, contact, service interest, venue.
   */
  function listLeads(filters) {
    assertDatabase();
    filters = filters || {};
    var records = RepositoryService.readAll(SHEET_LEADS);
    var search = ClientRepository.normalizeSearch(filters.search);
    var status = filters.status;
    var priority = filters.priority;
    var source = filters.sourceChannel;
    var fromDate = filters.followUpFrom;
    var toDate = filters.followUpTo;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (status && String(r.lead_status) !== String(status)) {
        continue;
      }
      if (priority && String(r.priority) !== String(priority)) {
        continue;
      }
      if (source && String(r.source_channel) !== String(source)) {
        continue;
      }
      if (search) {
        var haystack = [
          r.lead_name, r.business_or_organization, r.contact_number, r.email,
          r.service_interest, r.venue_or_location
        ].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
      }
      if (fromDate && String(r.next_follow_up_date) < String(fromDate)) {
        continue;
      }
      if (toDate && String(r.next_follow_up_date) > String(toDate)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return paginate(out, filters);
  }

  function paginate(items, filters) {
    var page = Math.max(Number(filters.page) || 1, 1);
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || ClientRepository.DEFAULT_PAGE_SIZE, 1), ClientRepository.MAX_PAGE_SIZE);
    var total = items.length;
    var start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  function isActiveStatus(status) {
    return ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'FOLLOW_UP', 'NEGOTIATING'].indexOf(String(status)) !== -1;
  }

  return {
    assertDatabase: assertDatabase,
    findById: findById,
    getLead: getLead,
    listLeads: listLeads,
    isActiveStatus: isActiveStatus
  };
})();
