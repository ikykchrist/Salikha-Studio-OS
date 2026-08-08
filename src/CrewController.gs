/**
 * CrewController.gs
 * Server entry points for the crew domain (Sprint 6): members,
 * assignments, sign-off, and payments. Crew payment posts exactly one
 * EXPENSE cash transaction with idempotency protection.
 */

function getCrewMembers(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.listCrew(filters || {}), 'Crew members retrieved.');
  })();
}

function getCrewMember(crewMemberId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.getCrew(crewMemberId), 'Crew member retrieved.');
  })();
}

function createCrewMember(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.createCrew(payload || {}), 'Crew member created.');
  })();
}

function updateCrewMember(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.updateCrew(payload || {}), 'Crew member updated.');
  })();
}

function deactivateCrewMember(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      CrewService.setCrewActive(payload && payload.crewMemberId, false, payload && payload.reason),
      'Crew member deactivated.');
  })();
}

function reactivateCrewMember(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      CrewService.setCrewActive(payload && payload.crewMemberId, true, payload && payload.reason),
      'Crew member reactivated.');
  })();
}

function getCrewAssignments(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.listAssignments(filters || {}), 'Crew assignments retrieved.');
  })();
}

function getCrewAssignment(crewAssignId) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.getAssignment(crewAssignId), 'Crew assignment retrieved.');
  })();
}

function createCrewAssignment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.createAssignment(payload || {}), 'Crew assigned.');
  })();
}

function updateCrewAssignment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.updateAssignment(payload || {}), 'Crew assignment updated.');
  })();
}

function signOffCrewAssignment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      CrewService.signOffAssignment(payload && payload.crewAssignId), 'Crew sign-off recorded.');
  })();
}

function payCrewAssignment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      CrewService.payAssignment(payload || {}), 'Crew payment recorded and posted to cash.');
  })();
}

function voidCrewPayment(payload) {
  return ErrorService.wrap(function () {
    return ResponseService.success(
      CrewService.voidCrewPayment(payload || {}), 'Crew payment voided. Cash restored.');
  })();
}

function getCrewPayments(filters) {
  return ErrorService.wrap(function () {
    return ResponseService.success(CrewService.listCrewPayments(filters || {}), 'Crew payments retrieved.');
  })();
}