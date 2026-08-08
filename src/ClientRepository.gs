/**
 * ClientRepository.gs
 * Sheet access and normalization for the customer domain (Sprint 2):
 * Clients, ClientNotes, ClientInteractions.
 *
 * Contains NO business decisions - only storage access, normalization,
 * search, and duplicate matching helpers. Rules live in ClientService.
 */

var ClientRepository = (function () {
  'use strict';

  // Sheet names as plain strings: resolved against SheetSchemaService at
  // call time (Apps Script loads files alphabetically, so top-level
  // cross-service references would fail for files before SheetSchemaService).
  var SHEET_CLIENTS = 'Clients';
  var SHEET_NOTES = 'ClientNotes';
  var SHEET_INTERACTIONS = 'ClientInteractions';

  var DEFAULT_PAGE_SIZE = 25;
  var MAX_PAGE_SIZE = 50;

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
    // Runtime guard: these constants must match the registered schema.
    SheetSchemaService.getSchema(SHEET_CLIENTS);
    SheetSchemaService.getSchema(SHEET_NOTES);
    SheetSchemaService.getSchema(SHEET_INTERACTIONS);
  }

  /* ------------------- Normalization helpers ------------------- */

  /**
   * Phone: keeps digits, drops spaces/dashes/parens/dots; preserves a
   * single leading +.
   */
  function normalizePhone(value) {
    var text = String(value || '').trim();
    if (!text) {
      return '';
    }
    var plus = text.charAt(0) === '+';
    var digits = text.replace(/[^\d]/g, '');
    return (plus ? '+' : '') + digits;
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  /**
   * URL: lowercase, strips protocol and trailing slash. Used for
   * duplicate matching of social profiles.
   */
  function normalizeUrl(value) {
    var text = String(value || '').trim().toLowerCase();
    text = text.replace(/^https?:\/\//, '').replace(/^www\./, '');
    text = text.replace(/\/+$/, '');
    return text;
  }

  /**
   * Name: lowercase, whitespace collapsed. Used for possible-match
   * scoring - never for display.
   */
  function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeSearch(value) {
    return normalizeName(value);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
  }

  function isValidUrl(value) {
    var text = String(value || '').trim();
    if (!text) {
      return true; // empty URLs are valid (optional field)
    }
    return /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}([/?#].*)?$/i.test(text);
  }

  /* ------------------- Clients ------------------- */

  function clientRecords() {
    return RepositoryService.readAll(SHEET_CLIENTS);
  }

  function findById(clientId) {
    return RepositoryService.findById(SHEET_CLIENTS, clientId);
  }

  function getClient(clientId) {
    var record = findById(clientId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function isActiveClient(record) {
    return String(record.client_status) !== 'ARCHIVED';
  }

  /**
   * Lists clients with search, filters, and pagination.
   * Search covers name, organization, phone, email, and Facebook URL.
   */
  function listClients(filters) {
    assertDatabase();
    filters = filters || {};
    var records = clientRecords();
    var search = normalizeSearch(filters.search);
    var status = filters.status;
    var clientType = filters.clientType;
    var source = filters.sourceChannel;
    var includeArchived = filters.includeArchived === true;

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!includeArchived && String(r.client_status) === 'ARCHIVED') {
        continue;
      }
      if (status && String(r.client_status) !== String(status)) {
        continue;
      }
      if (clientType && String(r.client_type) !== String(clientType)) {
        continue;
      }
      if (source && String(r.source_channel) !== String(source)) {
        continue;
      }
      if (search) {
        var haystack = [
          r.full_name, r.business_or_organization, r.contact_number,
          r.alternate_contact_number, r.email, normalizeUrl(r.facebook_profile_url)
        ].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) {
          continue;
        }
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
    var pageSize = Math.min(Math.max(Number(filters.pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    var total = items.length;
    var start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: total,
      page: page,
      pageSize: pageSize
    };
  }

  /* ------------------- Duplicate matching ------------------- */

  /**
   * Finds possible duplicate clients for a candidate payload.
   *
   * STRONG: exact normalized contact number, email, or Facebook URL
   * against a non-archived client.
   * POSSIBLE: same normalized name plus contact number.
   */
  function findPossibleDuplicates(candidate) {
    var phone = normalizePhone(candidate.contactNumber || candidate.contact_number);
    var email = normalizeEmail(candidate.email);
    var facebook = normalizeUrl(candidate.facebookProfileUrl || candidate.facebook_profile_url);
    var name = normalizeName(candidate.fullName || candidate.full_name);
    var org = normalizeName(candidate.businessOrOrganization || candidate.business_or_organization);
    var excludeId = candidate.clientId || candidate.client_id || '';

    var records = clientRecords();
    var strong = [];
    var possible = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (excludeId && String(r.client_id) === String(excludeId)) {
        continue;
      }
      if (String(r.client_status) === 'ARCHIVED') {
        continue;
      }
      var recordPhone = normalizePhone(r.contact_number);
      var recordEmail = normalizeEmail(r.email);
      var recordFacebook = normalizeUrl(r.facebook_profile_url);
      var recordName = normalizeName(r.full_name);
      var recordOrg = normalizeName(r.business_or_organization);

      var match = null;
      if (phone && recordPhone && phone === recordPhone) {
        match = { field: 'contactNumber', label: 'Contact number' };
      } else if (email && recordEmail && email === recordEmail) {
        match = { field: 'email', label: 'Email' };
      } else if (facebook && recordFacebook && facebook === recordFacebook) {
        match = { field: 'facebookProfileUrl', label: 'Facebook profile' };
      }
      if (match) {
        strong.push({
          clientId: r.client_id,
          clientName: r.full_name || r.business_or_organization,
          matchedOn: match.label
        });
        continue;
      }
      var nameMatched = name && recordName && name === recordName;
      var orgMatched = org && recordOrg && org === recordOrg;
      if (nameMatched || orgMatched) {
        possible.push({
          clientId: r.client_id,
          clientName: r.full_name || r.business_or_organization,
          matchedOn: 'Similar name or organization'
        });
      }
    }
    return { strong: strong, possible: possible };
  }

  /**
   * True when the candidate has at least one contact method.
   */
  function hasAnyContact(candidate) {
    return !!(normalizePhone(candidate.contactNumber || candidate.contact_number) ||
      normalizeEmail(candidate.email) ||
      normalizeUrl(candidate.facebookProfileUrl || candidate.facebook_profile_url) ||
      normalizeUrl(candidate.instagramProfileUrl || candidate.instagram_profile_url));
  }

  /* ------------------- Notes ------------------- */

  function listNotes(clientId) {
    assertDatabase();
    var records = RepositoryService.findByField(SHEET_NOTES, 'client_id', clientId);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      out.push(RepositoryService.toPublicRecord(records[i]));
    }
    out.sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    return out;
  }

  function findNoteById(noteId) {
    return RepositoryService.findById(SHEET_NOTES, noteId);
  }

  /* ------------------- Interactions ------------------- */

  function listInteractions(clientId, leadId) {
    assertDatabase();
    var records = RepositoryService.readAll(SHEET_INTERACTIONS);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (clientId && String(r.client_id) !== String(clientId)) {
        continue;
      }
      if (leadId && String(r.lead_id) !== String(leadId)) {
        continue;
      }
      out.push(RepositoryService.toPublicRecord(r));
    }
    out.sort(function (a, b) {
      return String(b.interactionDate || '').localeCompare(String(a.interactionDate || ''));
    });
    return out;
  }

  /**
   * Summary used by profiles and dashboards. Never returns full note
   * bodies or interaction details.
   */
  function getClientSummary(clientId) {
    assertDatabase();
    var record = findById(clientId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.CLIENT_NOT_FOUND, 'The client was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var notes = RepositoryService.findByField(SHEET_NOTES, 'client_id', clientId);
    var interactions = RepositoryService.findByField(SHEET_INTERACTIONS, 'client_id', clientId);
    var pinnedCount = 0;
    var warnings = 0;
    for (var i = 0; i < notes.length; i++) {
      if (String(notes[i].is_pinned) === 'TRUE' || notes[i].is_pinned === true) {
        pinnedCount++;
      }
      if (String(notes[i].note_type) === 'WARNING') {
        warnings++;
      }
    }
    var lastInteractionDate = '';
    for (var t = 0; t < interactions.length; t++) {
      if (String(interactions[t].interaction_date) > lastInteractionDate) {
        lastInteractionDate = String(interactions[t].interaction_date);
      }
    }
    var nextFollowUp = '';
    for (var f = 0; f < interactions.length; f++) {
      var nf = String(interactions[f].next_follow_up_date || '');
      if (nf && (!nextFollowUp || nf < nextFollowUp) && nf >= DateService.toIsoDate(DateService.now())) {
        nextFollowUp = nf;
      }
    }
    return {
      clientId: clientId,
      notesCount: notes.length,
      interactionsCount: interactions.length,
      pinnedNotes: pinnedCount,
      warningNotes: warnings,
      lastInteractionDate: lastInteractionDate,
      nextFollowUpDate: nextFollowUp
    };
  }

  return {
    assertDatabase: assertDatabase,
    normalizePhone: normalizePhone,
    normalizeEmail: normalizeEmail,
    normalizeUrl: normalizeUrl,
    normalizeName: normalizeName,
    normalizeSearch: normalizeSearch,
    isValidEmail: isValidEmail,
    isValidUrl: isValidUrl,
    findById: findById,
    getClient: getClient,
    listClients: listClients,
    findPossibleDuplicates: findPossibleDuplicates,
    hasAnyContact: hasAnyContact,
    listNotes: listNotes,
    findNoteById: findNoteById,
    listInteractions: listInteractions,
    getClientSummary: getClientSummary,
    isActiveClient: isActiveClient,
    DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE: MAX_PAGE_SIZE
  };
})();
