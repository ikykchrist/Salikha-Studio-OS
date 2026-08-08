/**
 * CustomerController.gs
 * Server entry points for Clients, Leads, and the home dashboard
 * (Sprint 2). All payloads validated; standardized responses; no row
 * numbers or property values are ever returned.
 */

/* ------------------- Clients ------------------- */

function getClients(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientRepository.listClients(filters || {}), 'Clients retrieved.');
  })();
}

function getClient(clientId) {
  return ErrorService.wrap(function () {
    var client = ClientRepository.getClient(clientId);
    if (!client) {
      throw ErrorService.create(ErrorService.CODES.CLIENT_NOT_FOUND, 'The client was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return ResponseService.success(client, 'Client retrieved.');
  })();
}

function createClient(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.createClient(payload || {}), 'Client created.');
  })();
}

function updateClient(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.updateClient(payload || {}), 'Client updated.');
  })();
}

function archiveClient(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.archiveClient(payload || {}), 'Client archived. History preserved.');
  })();
}

function reactivateClient(clientId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.reactivateClient(clientId), 'Client reactivated.');
  })();
}

function findPossibleDuplicateClients(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientRepository.findPossibleDuplicates(payload || {}), 'Duplicate check completed.');
  })();
}

function getClientNotes(clientId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientRepository.listNotes(clientId), 'Client notes retrieved.');
  })();
}

function createClientNote(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.createNote(payload || {}), 'Note added.');
  })();
}

function updateClientNote(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.updateNote(payload || {}), 'Note updated.');
  })();
}

function getClientInteractions(clientId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientRepository.listInteractions(clientId, null), 'Client interactions retrieved.');
  })();
}

function createClientInteraction(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientService.createInteraction(payload || {}), 'Interaction logged.');
  })();
}

function getClientSummary(clientId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientRepository.getClientSummary(clientId), 'Client summary retrieved.');
  })();
}

/* ------------------- Leads ------------------- */

function getLeads(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadRepository.listLeads(filters || {}), 'Leads retrieved.');
  })();
}

function getLead(leadId) {
  return ErrorService.wrap(function () {
    var lead = LeadRepository.getLead(leadId);
    if (!lead) {
      throw ErrorService.create(ErrorService.CODES.LEAD_NOT_FOUND, 'The lead was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return ResponseService.success(lead, 'Lead retrieved.');
  })();
}

function createLead(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.createLead(payload || {}), 'Lead created.');
  })();
}

function updateLead(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.updateLead(payload || {}), 'Lead updated.');
  })();
}

function changeLeadStatus(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.changeStatus(payload || {}), 'Lead status updated.');
  })();
}

function archiveLead(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.archiveLead(payload || {}), 'Lead archived. History preserved.');
  })();
}

function reactivateLead(leadId, reason) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.reactivateLead(leadId, reason), 'Lead reopened.');
  })();
}

function convertLead(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.convertLead(payload || {}), 'Lead converted to client. No booking was created.');
  })();
}

function getLeadInteractions(leadId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(ClientRepository.listInteractions(null, leadId), 'Lead interactions retrieved.');
  })();
}

function getLeadSummary(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(LeadService.getLeadSummary(), 'Lead summary retrieved.');
  })();
}

/* ------------------- Home dashboard (minimal) ------------------- */

function getHomeDashboardSummary() {
  return ErrorService.wrap(function () {
    if (!DatabaseService.isInitialized()) {
      return ResponseService.success({ uninitialized: true }, 'Database not initialized.');
    }
    var clientRecords = RepositoryService.readAll(SheetSchemaService.SHEET_CLIENTS);
    var activeClients = 0;
    var clientsThisMonth = 0;
    var currentMonth = DateService.toIsoDate(DateService.now()).substring(0, 7);
    for (var i = 0; i < clientRecords.length; i++) {
      if (String(clientRecords[i].client_status) !== 'ARCHIVED') {
        activeClients++;
      }
      if (String(clientRecords[i].created_at || '').substring(0, 7) === currentMonth) {
        clientsThisMonth++;
      }
    }
    var leadSummary = LeadService.getLeadSummary();
    var packageSummary = PackageService.getPackageSummary();
    var bookingSummary = BookingService.getBookingSummary();
    return ResponseService.success({
      activeClients: activeClients,
      clientsThisMonth: clientsThisMonth,
      openLeads: leadSummary.openLeads,
      followUpsDue: leadSummary.followUpsDue,
      activePackages: packageSummary.activePackages,
      upcomingEvents: bookingSummary.upcomingEvents,
      confirmedBookings: bookingSummary.confirmedBookings,
      outstandingReceivables: bookingSummary.outstandingReceivables,
      paymentsThisMonth: bookingSummary.paymentsThisMonth,
      attention: {
        unpaidConfirmed: bookingSummary.unpaidConfirmed,
        overpayments: bookingSummary.overpayments,
        missingEventDetails: bookingSummary.missingEventDetails,
        refundReviews: bookingSummary.refundReviews
      },
      returningClients: { available: false, value: null },
      bookingsThisMonth: { available: false, value: null }
    }, 'Home dashboard summary retrieved.');
  })();
}
