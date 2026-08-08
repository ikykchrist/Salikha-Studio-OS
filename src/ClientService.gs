/**
 * ClientService.gs
 * Customer master data: create/update/archive/reactivate, duplicate
 * detection, notes, and interactions (Sprint 2).
 *
 * No financial transactions are ever created here. Cached totals stay
 * zero until booking modules update them.
 */

var ClientService = (function () {
  'use strict';

  var TYPES = ['INDIVIDUAL', 'BUSINESS', 'ORGANIZATION', 'SCHOOL', 'GOVERNMENT', 'OTHER'];
  var STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED'];
  var CHANNELS = ['FACEBOOK', 'MESSENGER', 'PHONE', 'SMS', 'EMAIL', 'INSTAGRAM', 'OTHER'];
  var SOURCES = ['FACEBOOK', 'INSTAGRAM', 'REFERRAL', 'TIE_UP_PARTNER', 'WALK_IN', 'RETURNING_CLIENT', 'SCHOOL', 'EVENT', 'OTHER'];
  var NOTE_TYPES = ['GENERAL', 'PREFERENCE', 'PAYMENT_BEHAVIOR', 'EVENT_REQUIREMENT', 'FOLLOW_UP', 'WARNING', 'OTHER'];
  var NOTE_VISIBILITY = ['PUBLIC', 'INTERNAL'];
  var INTERACTION_TYPES = ['INQUIRY', 'FOLLOW_UP', 'CALL', 'MESSAGE', 'EMAIL', 'MEETING', 'QUOTE_DISCUSSION', 'COMPLAINT', 'FEEDBACK', 'OTHER'];
  var INTERACTION_CHANNELS = ['FACEBOOK', 'MESSENGER', 'PHONE', 'SMS', 'EMAIL', 'INSTAGRAM', 'IN_PERSON', 'OTHER'];

  function requireClient(clientId) {
    var record = ClientRepository.findById(clientId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.CLIENT_NOT_FOUND, 'The client was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function validateUrlField(value, label) {
    if (!ClientRepository.isValidUrl(value)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, label + ' is not a valid URL.', null, ErrorService.CATEGORY_VALIDATION);
    }
  }

  function validateClientPayload(payload, forUpdate) {
    var fullName = ValidationService.trimSafe(payload.fullName);
    var business = ValidationService.trimSafe(payload.businessOrOrganization);
    if (!fullName && !business) {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'Full name or business/organization name is required.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    var typeCheck = ValidationService.isEnum(payload.clientType || 'INDIVIDUAL', TYPES, 'Client type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var channel = payload.preferredContactChannel || 'OTHER';
    var channelCheck = ValidationService.isEnum(channel, CHANNELS, 'Preferred contact channel');
    if (!channelCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, channelCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var source = payload.sourceChannel || 'OTHER';
    var sourceCheck = ValidationService.isEnum(source, SOURCES, 'Source channel');
    if (!sourceCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, sourceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.email && !ClientRepository.isValidEmail(payload.email)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Email is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    validateUrlField(payload.facebookProfileUrl, 'Facebook profile URL');
    validateUrlField(payload.instagramProfileUrl, 'Instagram profile URL');
    if (payload.firstName) {
      var firstCheck = ValidationService.isString(payload.firstName, 'First name', 100);
      if (!firstCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, firstCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.lastName) {
      var lastCheck = ValidationService.isString(payload.lastName, 'Last name', 100);
      if (!lastCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, lastCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (!forUpdate && !ClientRepository.hasAnyContact(payload)) {
      throw ErrorService.create(
        ErrorService.CODES.CLIENT_CONTACT_REQUIRED,
        'At least one contact method (phone, email, or social profile) is required.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    return {
      fullName: fullName,
      business: business,
      phone: ClientRepository.normalizePhone(payload.contactNumber),
      alternatePhone: ClientRepository.normalizePhone(payload.alternateContactNumber),
      email: ClientRepository.normalizeEmail(payload.email)
    };
  }

  function createClient(payload) {
    ClientRepository.assertDatabase();
    var normalized = validateClientPayload(payload || {}, false);

    var duplicates = ClientRepository.findPossibleDuplicates(payload);
    if (duplicates.strong.length > 0) {
      throw ErrorService.create(
        ErrorService.CODES.DUPLICATE_CLIENT,
        'A client with the same contact details already exists. Duplicates are not merged automatically.',
        duplicates,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    if (duplicates.possible.length > 0 && !ValidationService.trimSafe(payload.duplicateOverrideReason)) {
      throw ErrorService.create(
        ErrorService.CODES.POSSIBLE_DUPLICATE_CLIENT,
        'A possible duplicate client was found. Review the matches and record an override reason to continue.',
        duplicates,
        ErrorService.CATEGORY_CONFLICT
      );
    }

    return LockManager.run(function () {
      var clientId = IdService.generateId('CLI');
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var record = {
        client_id: clientId,
        client_code: clientId,
        full_name: normalized.fullName,
        first_name: ValidationService.trimSafe(payload.firstName),
        last_name: ValidationService.trimSafe(payload.lastName),
        business_or_organization: normalized.business,
        contact_number: normalized.phone,
        alternate_contact_number: normalized.alternatePhone,
        email: normalized.email,
        facebook_profile_url: ClientRepository.normalizeUrl(payload.facebookProfileUrl),
        instagram_profile_url: ClientRepository.normalizeUrl(payload.instagramProfileUrl),
        address_line: ValidationService.trimSafe(payload.addressLine),
        city_municipality: ValidationService.trimSafe(payload.cityMunicipality),
        province: ValidationService.trimSafe(payload.province),
        preferred_contact_channel: payload.preferredContactChannel || 'OTHER',
        client_type: payload.clientType || 'INDIVIDUAL',
        client_status: 'ACTIVE',
        source_channel: payload.sourceChannel || 'OTHER',
        notes_summary: ValidationService.trimSafe(payload.notes) || '',
        total_bookings_cached: 0,
        total_revenue_cached: 0,
        outstanding_balance_cached: 0,
        last_booking_date: '',
        last_contacted_at: '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      };
      RepositoryService.appendRecord(SheetSchemaService.SHEET_CLIENTS, record);
      if (duplicates.possible.length > 0) {
        AuditService.info(AuditService.ACTIONS.CLIENT_DUPLICATE_OVERRIDE, 'Clients', clientId,
          'Possible duplicate overridden with reason: ' + ValidationService.trimSafe(payload.duplicateOverrideReason) + '.',
          { metadata: { possibleMatches: duplicates.possible.length } });
      }
      AuditService.info(AuditService.ACTIONS.CLIENT_CREATED, 'Clients', clientId,
        'Created client "' + (normalized.fullName || normalized.business) + '".');
      return ClientRepository.getClient(clientId);
    });
  }

  function updateClient(payload) {
    ClientRepository.assertDatabase();
    var clientId = payload.clientId;
    var record = requireClient(clientId);
    if (String(record.client_status) === 'ARCHIVED') {
      throw ErrorService.create(ErrorService.CODES.CLIENT_ALREADY_ARCHIVED,
        'Archived clients cannot be edited. Reactivate the client first.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var normalized = validateClientPayload(Object.assign({}, payload, {
      contactNumber: payload.contactNumber !== undefined ? payload.contactNumber : record.contact_number,
      email: payload.email !== undefined ? payload.email : record.email,
      facebookProfileUrl: payload.facebookProfileUrl !== undefined ? payload.facebookProfileUrl : record.facebook_profile_url,
      instagramProfileUrl: payload.instagramProfileUrl !== undefined ? payload.instagramProfileUrl : record.instagram_profile_url,
      fullName: payload.fullName !== undefined ? payload.fullName : record.full_name,
      businessOrOrganization: payload.businessOrOrganization !== undefined ? payload.businessOrOrganization : record.business_or_organization
    }), false);

    var duplicates = ClientRepository.findPossibleDuplicates(Object.assign({}, payload, {
      clientId: clientId,
      contactNumber: payload.contactNumber !== undefined ? payload.contactNumber : record.contact_number,
      email: payload.email !== undefined ? payload.email : record.email,
      facebookProfileUrl: payload.facebookProfileUrl !== undefined ? payload.facebookProfileUrl : record.facebook_profile_url
    }));
    if (duplicates.strong.length > 0) {
      throw ErrorService.create(ErrorService.CODES.DUPLICATE_CLIENT,
        'Another client already uses one of these contact details.', duplicates, ErrorService.CATEGORY_CONFLICT);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var patch = {
        full_name: normalized.fullName,
        first_name: ValidationService.trimSafe(payload.firstName),
        last_name: ValidationService.trimSafe(payload.lastName),
        business_or_organization: normalized.business,
        contact_number: normalized.phone,
        alternate_contact_number: normalized.alternatePhone,
        email: normalized.email,
        facebook_profile_url: ClientRepository.normalizeUrl(payload.facebookProfileUrl),
        instagram_profile_url: ClientRepository.normalizeUrl(payload.instagramProfileUrl),
        address_line: ValidationService.trimSafe(payload.addressLine),
        city_municipality: ValidationService.trimSafe(payload.cityMunicipality),
        province: ValidationService.trimSafe(payload.province),
        preferred_contact_channel: payload.preferredContactChannel || record.preferred_contact_channel,
        client_type: payload.clientType || record.client_type,
        source_channel: payload.sourceChannel || record.source_channel,
        notes_summary: ValidationService.trimSafe(payload.notes) !== '' ? ValidationService.trimSafe(payload.notes) : record.notes_summary,
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      RepositoryService.updateById(SheetSchemaService.SHEET_CLIENTS, clientId, patch);
      AuditService.info(AuditService.ACTIONS.CLIENT_UPDATED, 'Clients', clientId,
        'Updated client "' + (normalized.fullName || normalized.business) + '".');
      return ClientRepository.getClient(clientId);
    });
  }

  function archiveClient(payload) {
    ClientRepository.assertDatabase();
    var clientId = payload.clientId;
    var record = requireClient(clientId);
    if (String(record.client_status) === 'ARCHIVED') {
      throw ErrorService.create(ErrorService.CODES.CLIENT_ALREADY_ARCHIVED, 'This client is already archived.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_CLIENTS, clientId, {
        client_status: 'ARCHIVED',
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.CLIENT_ARCHIVED, 'Clients', clientId,
        'Archived client. History preserved; reactivation is possible.');
      return ClientRepository.getClient(clientId);
    });
  }

  function reactivateClient(clientId) {
    ClientRepository.assertDatabase();
    var record = requireClient(clientId);
    if (String(record.client_status) !== 'ARCHIVED') {
      return ClientRepository.getClient(clientId);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_CLIENTS, clientId, {
        client_status: 'ACTIVE',
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.CLIENT_REACTIVATED, 'Clients', clientId, 'Reactivated client.');
      return ClientRepository.getClient(clientId);
    });
  }

  /* ------------------- Notes ------------------- */

  function createNote(payload) {
    ClientRepository.assertDatabase();
    requireClient(payload.clientId);
    var text = ValidationService.trimSafe(payload.noteText);
    var textCheck = ValidationService.isNonEmptyString(text, 'Note text', 2000);
    if (!textCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, textCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(payload.noteType || 'GENERAL', NOTE_TYPES, 'Note type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var visibilityCheck = ValidationService.isEnum(payload.visibility || 'PUBLIC', NOTE_VISIBILITY, 'Visibility');
    if (!visibilityCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, visibilityCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var noteId = IdService.generateId('NTE');
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.appendRecord(SheetSchemaService.SHEET_CLIENT_NOTES, {
        note_id: noteId,
        client_id: payload.clientId,
        note_type: payload.noteType || 'GENERAL',
        note_text: text,
        is_pinned: !!payload.isPinned,
        visibility: payload.visibility || 'PUBLIC',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
      AuditService.info(AuditService.ACTIONS.CLIENT_NOTE_CREATED, 'ClientNotes', noteId,
        'Added ' + (payload.noteType || 'GENERAL') + ' note for client ' + payload.clientId + '.',
        { metadata: { noteType: payload.noteType || 'GENERAL' } });
      return getNote(noteId);
    });
  }

  function updateNote(payload) {
    ClientRepository.assertDatabase();
    var note = ClientRepository.findNoteById(payload.noteId);
    if (!note) {
      throw ErrorService.create(ErrorService.CODES.NOT_FOUND, 'The note was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var text = ValidationService.trimSafe(payload.noteText);
    if (!text) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Note text is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_CLIENT_NOTES, payload.noteId, {
        note_text: text,
        note_type: payload.noteType || note.note_type,
        is_pinned: payload.isPinned !== undefined ? !!payload.isPinned : note.is_pinned,
        updated_at: DateService.nowIso(),
        updated_by: actor.userId
      });
      AuditService.info(AuditService.ACTIONS.CLIENT_NOTE_UPDATED, 'ClientNotes', payload.noteId,
        'Updated note for client ' + note.client_id + '.');
      return getNote(payload.noteId);
    });
  }

  function getNote(noteId) {
    var record = ClientRepository.findNoteById(noteId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  /* ------------------- Interactions ------------------- */

  function createInteraction(payload) {
    ClientRepository.assertDatabase();
    if (!payload.clientId && !payload.leadId) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'An interaction must be linked to a client or a lead.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.clientId) {
      requireClient(payload.clientId);
    }
    var summary = ValidationService.trimSafe(payload.summary);
    var summaryCheck = ValidationService.isNonEmptyString(summary, 'Interaction summary', 1000);
    if (!summaryCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, summaryCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(payload.interactionType || 'OTHER', INTERACTION_TYPES, 'Interaction type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.nextFollowUpDate) {
      var dateCheck = ValidationService.isDate(payload.nextFollowUpDate, 'Next follow-up date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    return LockManager.run(function () {
      var interactionId = IdService.generateId('INT');
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var record = {
        interaction_id: interactionId,
        client_id: payload.clientId || '',
        lead_id: payload.leadId || '',
        interaction_date: payload.interactionDate || DateService.toIsoDate(DateService.now()),
        interaction_type: payload.interactionType || 'OTHER',
        channel: payload.channel || 'OTHER',
        subject: ValidationService.trimSafe(payload.subject),
        summary: summary,
        outcome: ValidationService.trimSafe(payload.outcome),
        next_follow_up_date: payload.nextFollowUpDate || '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      };
      RepositoryService.appendRecord(SheetSchemaService.SHEET_CLIENT_INTERACTIONS, record);
      if (payload.clientId) {
        RepositoryService.updateById(SheetSchemaService.SHEET_CLIENTS, payload.clientId, {
          last_contacted_at: record.interaction_date,
          updated_at: now,
          updated_by: actor.userId
        });
      }
      AuditService.info(AuditService.ACTIONS.CLIENT_INTERACTION_LOGGED, 'ClientInteractions', interactionId,
        'Logged ' + (payload.interactionType || 'OTHER') + ' interaction' + (payload.clientId ? ' for client ' + payload.clientId : ' for lead ' + payload.leadId) + '.');
      return RepositoryService.toPublicRecord(record);
    });
  }

  return {
    createClient: createClient,
    updateClient: updateClient,
    archiveClient: archiveClient,
    reactivateClient: reactivateClient,
    createNote: createNote,
    updateNote: updateNote,
    createInteraction: createInteraction,
    TYPES: TYPES.slice(0),
    STATUSES: STATUSES.slice(0),
    CHANNELS: CHANNELS.slice(0),
    SOURCES: SOURCES.slice(0),
    NOTE_TYPES: NOTE_TYPES.slice(0),
    INTERACTION_TYPES: INTERACTION_TYPES.slice(0)
  };
})();
