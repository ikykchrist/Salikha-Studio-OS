/**
 * LeadService.gs
 * Lead pipeline: create/update, validated status transitions, archiving,
 * and the controlled conversion workflow (Sprint 2).
 *
 * Conversion NEVER creates a booking - it links or creates a client
 * only, preserves the lead, and marks it WON.
 */

var LeadService = (function () {
  'use strict';

  var STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'FOLLOW_UP', 'NEGOTIATING', 'WON', 'LOST', 'ARCHIVED'];
  var PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  var SOURCES = ['FACEBOOK', 'INSTAGRAM', 'REFERRAL', 'TIE_UP_PARTNER', 'WALK_IN', 'RETURNING_CLIENT', 'SCHOOL', 'EVENT', 'OTHER'];
  var EVENT_TYPES = ['WEDDING', 'DEBUT', 'BIRTHDAY', 'CORPORATE', 'SCHOOL_EVENT', 'OTHER'];

  var CHAIN = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'FOLLOW_UP', 'NEGOTIATING', 'WON'];

  function requireLead(leadId) {
    var record = LeadRepository.findById(leadId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.LEAD_NOT_FOUND, 'The lead was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function validateLeadPayload(payload, forUpdate) {
    var name = ValidationService.trimSafe(payload.leadName);
    var business = ValidationService.trimSafe(payload.businessOrOrganization);
    if (!name && !business) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Lead name or business/organization name is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.contactNumber) {
      ClientRepository.normalizePhone(payload.contactNumber); // normalize (no throw)
    }
    if (payload.email && !ClientRepository.isValidEmail(payload.email)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Email is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.facebookProfileUrl && !ClientRepository.isValidUrl(payload.facebookProfileUrl)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Facebook profile URL is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.instagramProfileUrl && !ClientRepository.isValidUrl(payload.instagramProfileUrl)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Instagram profile URL is not valid.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var status = payload.leadStatus || (forUpdate ? null : 'NEW');
    if (status) {
      var statusCheck = ValidationService.isEnum(status, STATUSES, 'Lead status');
      if (!statusCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, statusCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    var priority = payload.priority || 'NORMAL';
    var priorityCheck = ValidationService.isEnum(priority, PRIORITIES, 'Priority');
    if (!priorityCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, priorityCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.sourceChannel) {
      var sourceCheck = ValidationService.isEnum(payload.sourceChannel, SOURCES, 'Source channel');
      if (!sourceCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, sourceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.eventType) {
      var eventCheck = ValidationService.isEnum(payload.eventType, EVENT_TYPES, 'Event type');
      if (!eventCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, eventCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.estimatedBudget !== undefined && payload.estimatedBudget !== null && payload.estimatedBudget !== '') {
      var budget = Number(payload.estimatedBudget);
      var budgetCheck = ValidationService.isNonNegativeAmount(budget, 'Estimated budget');
      if (!budgetCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, budgetCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.eventDateInterest) {
      var dateCheck = ValidationService.isDate(payload.eventDateInterest, 'Event date of interest');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.nextFollowUpDate) {
      var followCheck = ValidationService.isDate(payload.nextFollowUpDate, 'Next follow-up date');
      if (!followCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, followCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    return {
      name: name,
      business: business,
      phone: ClientRepository.normalizePhone(payload.contactNumber)
    };
  }

  function createLead(payload) {
    LeadRepository.assertDatabase();
    var normalized = validateLeadPayload(payload || {}, false);
    return LockManager.run(function () {
      var leadId = IdService.generateId('LED');
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var record = {
        lead_id: leadId,
        lead_code: leadId,
        lead_name: normalized.name,
        business_or_organization: normalized.business,
        contact_number: normalized.phone,
        email: ClientRepository.normalizeEmail(payload.email),
        facebook_profile_url: ClientRepository.normalizeUrl(payload.facebookProfileUrl),
        instagram_profile_url: ClientRepository.normalizeUrl(payload.instagramProfileUrl),
        event_type: payload.eventType || '',
        event_date_interest: payload.eventDateInterest || '',
        venue_or_location: ValidationService.trimSafe(payload.venueOrLocation),
        service_interest: ValidationService.trimSafe(payload.serviceInterest),
        estimated_budget: payload.estimatedBudget !== undefined && payload.estimatedBudget !== '' ? Number(payload.estimatedBudget) : 0,
        source_channel: payload.sourceChannel || 'OTHER',
        referred_by: ValidationService.trimSafe(payload.referredBy),
        lead_status: 'NEW',
        priority: payload.priority || 'NORMAL',
        assigned_to: ValidationService.trimSafe(payload.assignedTo),
        last_contacted_at: '',
        next_follow_up_date: payload.nextFollowUpDate || '',
        lost_reason: '',
        converted_client_id: '',
        converted_at: '',
        notes_summary: ValidationService.trimSafe(payload.notes) || '',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      };
      RepositoryService.appendRecord(SheetSchemaService.SHEET_LEADS, record);
      AuditService.info(AuditService.ACTIONS.LEAD_CREATED, 'Leads', leadId,
        'Created lead "' + (normalized.name || normalized.business) + '".');
      return LeadRepository.getLead(leadId);
    });
  }

  function updateLead(payload) {
    LeadRepository.assertDatabase();
    var leadId = payload.leadId;
    var record = requireLead(leadId);
    var normalized = validateLeadPayload(Object.assign({}, payload, {
      leadName: payload.leadName !== undefined ? payload.leadName : record.lead_name,
      businessOrOrganization: payload.businessOrOrganization !== undefined ? payload.businessOrOrganization : record.business_or_organization
    }), true);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var patch = {
        lead_name: normalized.name,
        business_or_organization: normalized.business,
        contact_number: ClientRepository.normalizePhone(payload.contactNumber !== undefined ? payload.contactNumber : record.contact_number),
        email: ClientRepository.normalizeEmail(payload.email !== undefined ? payload.email : record.email),
        facebook_profile_url: ClientRepository.normalizeUrl(payload.facebookProfileUrl !== undefined ? payload.facebookProfileUrl : record.facebook_profile_url),
        instagram_profile_url: ClientRepository.normalizeUrl(payload.instagramProfileUrl !== undefined ? payload.instagramProfileUrl : record.instagram_profile_url),
        event_type: payload.eventType !== undefined ? payload.eventType : record.event_type,
        event_date_interest: payload.eventDateInterest !== undefined ? payload.eventDateInterest : record.event_date_interest,
        venue_or_location: payload.venueOrLocation !== undefined ? ValidationService.trimSafe(payload.venueOrLocation) : record.venue_or_location,
        service_interest: payload.serviceInterest !== undefined ? ValidationService.trimSafe(payload.serviceInterest) : record.service_interest,
        estimated_budget: payload.estimatedBudget !== undefined && payload.estimatedBudget !== '' ? Number(payload.estimatedBudget) : record.estimated_budget,
        source_channel: payload.sourceChannel !== undefined ? payload.sourceChannel : record.source_channel,
        referred_by: payload.referredBy !== undefined ? ValidationService.trimSafe(payload.referredBy) : record.referred_by,
        priority: payload.priority !== undefined ? payload.priority : record.priority,
        assigned_to: payload.assignedTo !== undefined ? ValidationService.trimSafe(payload.assignedTo) : record.assigned_to,
        next_follow_up_date: payload.nextFollowUpDate !== undefined ? payload.nextFollowUpDate : record.next_follow_up_date,
        notes_summary: payload.notes !== undefined ? ValidationService.trimSafe(payload.notes) : record.notes_summary,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      RepositoryService.updateById(SheetSchemaService.SHEET_LEADS, leadId, patch);
      AuditService.info(AuditService.ACTIONS.LEAD_UPDATED, 'Leads', leadId,
        'Updated lead "' + (normalized.name || normalized.business) + '".');
      return LeadRepository.getLead(leadId);
    });
  }

  /* ------------------- Status machine ------------------- */

  /**
   * Valid transition check.
   * - Forward movement within the main chain is allowed (including skips).
   * - WON is terminal and only reachable through conversion.
   * - LOST requires a reason; leaving LOST/ARCHIVED requires a reason.
   */
  function validateTransition(current, target, payload) {
    if (current === target) {
      return { ok: true };
    }
    if (target === 'WON') {
      return { ok: false, message: 'A lead reaches WON only through conversion.' };
    }
    if (String(current) === 'WON') {
      return { ok: false, message: 'A converted lead cannot change status.' };
    }
    if (target === 'LOST') {
      if (!ValidationService.trimSafe(payload.reason)) {
        return { ok: false, message: 'A lost reason is required.', code: ErrorService.CODES.LEAD_LOST_REASON_REQUIRED };
      }
      return { ok: true };
    }
    if (target === 'ARCHIVED') {
      return { ok: true };
    }
    var currentIndex = CHAIN.indexOf(String(current));
    var targetIndex = CHAIN.indexOf(String(target));
    if (currentIndex === -1 && targetIndex >= 0) {
      // reopening from LOST/ARCHIVED into the chain
      if (!ValidationService.trimSafe(payload.reason)) {
        return { ok: false, message: 'A reason is required when reopening a lost or archived lead.' };
      }
      return { ok: true };
    }
    if (currentIndex >= 0 && targetIndex > currentIndex) {
      return { ok: true };
    }
    return { ok: false, message: 'This lead status change is not allowed.' };
  }

  function changeStatus(payload) {
    LeadRepository.assertDatabase();
    var leadId = payload.leadId;
    var record = requireLead(leadId);
    var target = payload.leadStatus;
    var targetCheck = ValidationService.isEnum(target, STATUSES, 'Lead status');
    if (!targetCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, targetCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var transition = validateTransition(record.lead_status, target, payload);
    if (!transition.ok) {
      throw ErrorService.create(
        transition.code || ErrorService.CODES.INVALID_LEAD_STATUS_TRANSITION,
        transition.message,
        { from: record.lead_status, to: target },
        ErrorService.CATEGORY_VALIDATION
      );
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var patch = {
        lead_status: target,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      if (target === 'LOST') {
        patch.lost_reason = ValidationService.trimSafe(payload.reason);
      }
      if (target === 'CONTACTED' || target === 'QUALIFIED') {
        patch.last_contacted_at = patch.last_contacted_at || DateService.toIsoDate(DateService.now());
      }
      RepositoryService.updateById(SheetSchemaService.SHEET_LEADS, leadId, patch);
      AuditService.info(AuditService.ACTIONS.LEAD_STATUS_CHANGED, 'Leads', leadId,
        'Lead status changed from ' + record.lead_status + ' to ' + target + '.',
        { metadata: { from: record.lead_status, to: target } });
      return LeadRepository.getLead(leadId);
    });
  }

  function archiveLead(payload) {
    LeadRepository.assertDatabase();
    var record = requireLead(payload.leadId);
    if (String(record.lead_status) === 'ARCHIVED') {
      return LeadRepository.getLead(payload.leadId);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_LEADS, payload.leadId, {
        lead_status: 'ARCHIVED',
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.LEAD_ARCHIVED, 'Leads', payload.leadId, 'Archived lead. History preserved.');
      return LeadRepository.getLead(payload.leadId);
    });
  }

  function reactivateLead(leadId, reason) {
    LeadRepository.assertDatabase();
    var record = requireLead(leadId);
    if (String(record.lead_status) !== 'ARCHIVED' && String(record.lead_status) !== 'LOST') {
      return LeadRepository.getLead(leadId);
    }
    var reasonText = ValidationService.trimSafe(reason);
    if (!reasonText) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A reason is required when reopening a lost or archived lead.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_LEADS, leadId, {
        lead_status: 'NEW',
        lost_reason: '',
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.LEAD_REACTIVATED, 'Leads', leadId,
        'Lead reopened with reason: ' + reasonText + '.');
      return LeadRepository.getLead(leadId);
    });
  }

  /* ------------------- Conversion ------------------- */

  /**
   * Converts a lead into a client. Supported modes:
   *   action: 'CREATE' - build a client from the lead + payload overrides
   *   action: 'LINK'   - link to an existing clientId
   * The lead is preserved, marked WON, and never converted again.
   * No booking is created.
   */
  function convertLead(payload) {
    LeadRepository.assertDatabase();
    var leadId = payload.leadId;
    var record = requireLead(leadId);

    if (String(record.lead_status) === 'WON' && record.converted_client_id) {
      throw ErrorService.create(ErrorService.CODES.LEAD_ALREADY_CONVERTED,
        'This lead has already been converted to a client.', { clientId: record.converted_client_id }, ErrorService.CATEGORY_CONFLICT);
    }
    if (String(record.lead_status) === 'LOST' || String(record.lead_status) === 'ARCHIVED') {
      throw ErrorService.create(ErrorService.CODES.INVALID_LEAD_STATUS_TRANSITION,
        'Only an active lead can be converted. Reopen the lead first.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var action = payload.action === 'LINK' ? 'LINK' : 'CREATE';

    return LockManager.run(function () {
      var clientId;
      if (action === 'LINK') {
        var existing = ClientRepository.findById(payload.clientId);
        if (!existing) {
          throw ErrorService.create(ErrorService.CODES.CLIENT_NOT_FOUND, 'The client to link was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
        }
        clientId = existing.client_id;
      } else {
        var clientPayload = buildClientPayloadFromLead(record, payload);
        var duplicates = ClientRepository.findPossibleDuplicates(clientPayload);
        if (duplicates.strong.length > 0) {
          throw ErrorService.create(ErrorService.CODES.LEAD_CONVERSION_CONFLICT,
            'A client with the same contact details already exists. Link to the existing client instead.',
            duplicates, ErrorService.CATEGORY_CONFLICT);
        }
        if (duplicates.possible.length > 0 && !ValidationService.trimSafe(payload.duplicateOverrideReason)) {
          throw ErrorService.create(ErrorService.CODES.POSSIBLE_DUPLICATE_CLIENT,
            'A possible duplicate client was found. Review the matches and record an override reason to continue.',
            duplicates, ErrorService.CATEGORY_CONFLICT);
        }
        var created = ClientService.createClient(clientPayload);
        clientId = created.clientId;
      }

      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      RepositoryService.updateById(SheetSchemaService.SHEET_LEADS, leadId, {
        lead_status: 'WON',
        converted_client_id: clientId,
        converted_at: now,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.LEAD_CONVERTED, 'Leads', leadId,
        'Lead converted to client ' + clientId + ' (' + action + '). No booking was created.',
        { metadata: { action: action, clientId: clientId } });
      return {
        lead: LeadRepository.getLead(leadId),
        client: ClientRepository.getClient(clientId),
        action: action
      };
    });
  }

  /**
   * Prefills the client payload from the lead. The user reviews and
   * confirms the carried-over fields before conversion.
   */
  function buildClientPayloadFromLead(lead, payload) {
    return {
      fullName: payload.fullName !== undefined ? payload.fullName : lead.lead_name,
      businessOrOrganization: payload.businessOrOrganization !== undefined ? payload.businessOrOrganization : lead.business_or_organization,
      contactNumber: payload.contactNumber !== undefined ? payload.contactNumber : lead.contact_number,
      email: payload.email !== undefined ? payload.email : lead.email,
      facebookProfileUrl: payload.facebookProfileUrl !== undefined ? payload.facebookProfileUrl : lead.facebook_profile_url,
      instagramProfileUrl: payload.instagramProfileUrl !== undefined ? payload.instagramProfileUrl : lead.instagram_profile_url,
      clientType: payload.clientType || 'INDIVIDUAL',
      sourceChannel: payload.sourceChannel || lead.source_channel || 'OTHER',
      notes: payload.notes !== undefined ? payload.notes : ('Converted from lead ' + lead.lead_id + '.'),
      duplicateOverrideReason: payload.duplicateOverrideReason
    };
  }

  /**
   * Lead summary for dashboards (counts only, no personal data).
   */
  function getLeadSummary() {
    LeadRepository.assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_LEADS);
    var today = DateService.toIsoDate(DateService.now());
    var summary = {
      newLeads: 0,
      needsFollowUp: 0,
      negotiating: 0,
      wonThisMonth: 0,
      lostThisMonth: 0,
      openLeads: 0,
      followUpsDue: 0
    };
    var currentMonth = today.substring(0, 7);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var status = String(r.lead_status);
      if (status === 'NEW') {
        summary.newLeads++;
      }
      if (status === 'NEGOTIATING') {
        summary.negotiating++;
      }
      if (LeadRepository.isActiveStatus(status)) {
        summary.openLeads++;
      }
      if (status === 'WON' && String(r.converted_at || '').substring(0, 7) === currentMonth) {
        summary.wonThisMonth++;
      }
      if (status === 'LOST' && String(r.updated_at || '').substring(0, 7) === currentMonth) {
        summary.lostThisMonth++;
      }
      var nextFollowUp = String(r.next_follow_up_date || '');
      if (LeadRepository.isActiveStatus(status) && nextFollowUp && nextFollowUp <= today) {
        summary.needsFollowUp++;
        summary.followUpsDue++;
      }
    }
    return summary;
  }

  return {
    createLead: createLead,
    updateLead: updateLead,
    changeStatus: changeStatus,
    archiveLead: archiveLead,
    reactivateLead: reactivateLead,
    convertLead: convertLead,
    getLeadSummary: getLeadSummary,
    validateTransition: validateTransition,
    STATUSES: STATUSES.slice(0),
    PRIORITIES: PRIORITIES.slice(0),
    SOURCES: SOURCES.slice(0),
    EVENT_TYPES: EVENT_TYPES.slice(0)
  };
})();
