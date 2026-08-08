/**
 * BookingService.gs
 * Booking orchestration (Sprint 3): create/update, status workflow,
 * cancellation, archive/reactivate, rescheduling, conflict handling,
 * summaries, and cached-balance verification.
 *
 * Booking creation never posts cash. All totals are server-calculated.
 */

var BookingService = (function () {
  'use strict';

  var SOURCE_CHANNELS = ['FACEBOOK', 'INSTAGRAM', 'REFERRAL', 'TIE_UP_PARTNER', 'WALK_IN', 'RETURNING_CLIENT', 'SCHOOL', 'EVENT', 'OTHER'];

  // Lazy accessors: Apps Script loads files alphabetically, so other
  // services must be referenced at call time, never at file load.
  function serviceTypes() {
    return PackageService.SERVICE_TYPES;
  }

  function eventTypes() {
    return LeadService.EVENT_TYPES;
  }

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

  function requireBooking(bookingId) {
    var record = BookingRepository.findById(bookingId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_NOT_FOUND, 'The booking was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function validateTime(value, label) {
    if (value && !/^\d{2}:\d{2}$/.test(String(value))) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        label + ' must use HH:mm format.', null, ErrorService.CATEGORY_VALIDATION);
    }
  }

  function validateBookingPayload(payload) {
    // Client
    var client = ClientRepository.findById(payload.clientId);
    if (!client) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_CLIENT_REQUIRED,
        'A valid active client is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (String(client.client_status) === 'ARCHIVED' || String(client.client_status) === 'BLOCKED') {
      throw ErrorService.create(ErrorService.CODES.BOOKING_CLIENT_REQUIRED,
        'The selected client is not active. Reactivate the client first.', null, ErrorService.CATEGORY_VALIDATION);
    }

    // Optional lead
    if (payload.leadId) {
      var lead = LeadRepository.findById(payload.leadId);
      if (!lead) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'The referenced lead was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
      }
    }

    // Title
    var title = ValidationService.trimSafe(payload.bookingTitle);
    if (!title) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A booking title is required.', null, ErrorService.CATEGORY_VALIDATION);
    }

    // Enums
    var serviceCheck = ValidationService.isEnum(payload.serviceType, serviceTypes(), 'Service type');
    if (!serviceCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, serviceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.eventType) {
      var eventCheck = ValidationService.isEnum(payload.eventType, eventTypes(), 'Event type');
      if (!eventCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, eventCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.sourceChannel) {
      var sourceCheck = ValidationService.isEnum(payload.sourceChannel, SOURCE_CHANNELS, 'Source channel');
      if (!sourceCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, sourceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }

    // Event date + times
    if (payload.eventDate) {
      var dateCheck = ValidationService.isDate(payload.eventDate, 'Event date');
      if (!dateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    validateTime(payload.eventStartTime, 'Event start time');
    validateTime(payload.eventEndTime, 'Event end time');
    if (payload.eventStartTime && payload.eventEndTime) {
      if (String(payload.eventEndTime) <= String(payload.eventStartTime)) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'Event end time must be after the start time.', null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    var setup = Number(payload.setupTime || 0);
    if (setup < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'Setup time cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }

    return {
      client: client,
      title: title
    };
  }

  /**
   * Snapshots the package and add-ons into pricing payload pieces.
   */
  function buildPricingPayload(payload) {
    var pricing = {
      customCharges: payload.customCharges || [],
      transportationCharge: payload.transportationCharge || 0,
      discountType: payload.discountType || 'NONE',
      discountValue: payload.discountValue || 0,
      plannedPartnerCommission: payload.plannedPartnerCommission || 0,
      estimatedDirectCostSource: payload.estimatedDirectCostSource || 'CALCULATED',
      manualEstimatedDirectCost: payload.manualEstimatedDirectCost
    };
    if (payload.packageId) {
      var pkg = PackageRepository.findById(payload.packageId);
      if (!pkg) {
        throw ErrorService.create(ErrorService.CODES.PACKAGE_SNAPSHOT_ERROR,
          'The selected package was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
      }
      pricing.package = {
        packageId: pkg.package_id,
        name: pkg.package_name,
        basePrice: pkg.base_price,
        expectedDirectCost: pkg.expected_direct_cost,
        durationHours: pkg.duration_hours
      };
    }
    if (payload.addOnIds && payload.addOnIds.length) {
      var addOns = [];
      var seen = {};
      for (var i = 0; i < payload.addOnIds.length; i++) {
        var id = payload.addOnIds[i];
        if (seen[id]) {
          continue;
        }
        seen[id] = true;
        var addOn = PackageRepository.findAddOnById(id);
        if (!addOn) {
          throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
            'One of the selected add-ons was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
        }
        addOns.push({
          addOnId: addOn.add_on_id,
          name: addOn.add_on_name,
          sellingPrice: addOn.selling_price,
          estimatedDirectCost: addOn.estimated_direct_cost,
          unit: addOn.unit
        });
      }
      pricing.addOns = addOns;
    }
    return pricing;
  }

  function buildBookingRecord(payload, pricingResult, pricing, validated, actor, now, bookingId) {
    var status = payload.initialStatus || 'INQUIRY';
    if (BookingStatusService.RESERVED.indexOf(String(status)) !== -1) {
      status = 'INQUIRY';
    }
    if (String(status) === 'CONFIRMED') {
      BookingStatusService.validateTransitionPreconditions(
        { client_id: payload.clientId, event_date: payload.eventDate, gross_booking_amount: pricingResult.grossBookingAmount },
        'CONFIRMED', '', payload.overrideReason);
    }
    var pkg = (pricing && pricing.package) || {};
    return {
      booking_id: bookingId,
      booking_code: bookingId,
      client_id: payload.clientId,
      lead_id: payload.leadId || '',
      booking_title: validated.title,
      service_type: payload.serviceType,
      event_type: payload.eventType || '',
      event_date: payload.eventDate || '',
      event_start_time: payload.eventStartTime || '',
      event_end_time: payload.eventEndTime || '',
      setup_time: Number(payload.setupTime || 0),
      venue_name: ValidationService.trimSafe(payload.venueName),
      venue_address: ValidationService.trimSafe(payload.venueAddress),
      city_municipality: ValidationService.trimSafe(payload.cityMunicipality),
      province: ValidationService.trimSafe(payload.province),
      venue_contact_name: ValidationService.trimSafe(payload.venueContactName),
      venue_contact_number: ClientRepository.normalizePhone(payload.venueContactNumber),
      package_id: payload.packageId || '',
      package_name_snapshot: pkg.name || '',
      package_price_snapshot: pkg.basePrice !== undefined ? Number(pkg.basePrice) : 0,
      package_duration_snapshot: pkg.durationHours || '',
      subtotal: pricingResult.subtotal,
      add_on_total: pricingResult.addOnTotal,
      custom_charge_total: pricingResult.customChargeTotal,
      transportation_charge: pricingResult.transportationCharge,
      discount_type: pricingResult.discountType,
      discount_value: pricingResult.discountValue,
      discount_amount: pricingResult.discountAmount,
      gross_booking_amount: pricingResult.grossBookingAmount,
      planned_partner_commission: pricingResult.plannedPartnerCommission,
      net_contract_amount: pricingResult.netContractAmount,
      estimated_direct_cost: pricingResult.estimatedDirectCost,
      estimated_gross_profit: pricingResult.estimatedGrossProfit,
      estimated_profit_margin: pricingResult.estimatedProfitMargin,
      amount_paid_cached: 0,
      balance_due_cached: pricingResult.grossBookingAmount,
      booking_status: status,
      payment_status: 'UNPAID',
      production_status: '',
      deployment_status: '',
      source_channel: payload.sourceChannel || 'OTHER',
      partner_id: payload.partnerId || '',
      assigned_owner: ValidationService.trimSafe(payload.assignedOwner),
      special_instructions: ValidationService.trimSafe(payload.specialInstructions),
      internal_notes: ValidationService.trimSafe(payload.internalNotes),
      cancellation_reason: '',
      cancelled_at: '',
      cancelled_by: '',
      completed_at: '',
      financially_closed_at: '',
      idempotency_key: payload.idempotencyKey || '',
      created_at: now,
      created_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId,
      version: 1
    };
  }

  /**
   * Creates a booking with atomic item insertion. No cash movement.
   */
  function createBooking(payload) {
    assertDatabase();
    var validated = validateBookingPayload(payload || {});
    var pricing = buildPricingPayload(payload);
    var pricingResult = BookingPricingService.calculatePricing(pricing);

    var conflicts = BookingConflictService.checkConflicts({
      eventDate: payload.eventDate,
      eventStartTime: payload.eventStartTime,
      eventEndTime: payload.eventEndTime,
      setupTime: payload.setupTime,
      serviceType: payload.serviceType,
      assignedOwner: payload.assignedOwner,
      excludeBookingId: null
    });
    var overrideReason = ValidationService.trimSafe(payload.overrideReason);
    if (conflicts.length > 0 && !overrideReason) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_CONFLICT,
        'This booking conflicts with another booking. Provide an override reason to continue.',
        { conflicts: conflicts }, ErrorService.CATEGORY_CONFLICT);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var bookingId = IdService.generateId('BKG');

      if (payload.idempotencyKey) {
        var existing = RepositoryService.findByField(SheetSchemaService.SHEET_BOOKINGS, 'idempotency_key', payload.idempotencyKey);
        if (existing.length > 0) {
          return { duplicate: true, booking: BookingRepository.getBooking(existing[0].booking_id) };
        }
      }

      var record = buildBookingRecord(payload, pricingResult, pricing, validated, actor, now, bookingId);
      RepositoryService.appendRecord(SheetSchemaService.SHEET_BOOKINGS, record);
      insertItems(bookingId, pricingResult.items, actor, now);

      if (conflicts.length > 0 && overrideReason) {
        AuditService.info(AuditService.ACTIONS.BOOKING_CONFLICT_OVERRIDE, 'Bookings', bookingId,
          'Created with ' + conflicts.length + ' schedule conflict(s) overridden. Reason: ' + overrideReason + '.');
      }
      AuditService.info(AuditService.ACTIONS.BOOKING_CREATED, 'Bookings', bookingId,
        'Created booking "' + validated.title + '" for client ' + payload.clientId + '. Total: ' + pricingResult.grossBookingAmount + '. No cash movement.');
      if (String(record.booking_status) !== 'INQUIRY') {
        BookingStatusService.recordStatusChange(bookingId, 'INQUIRY', record.booking_status, 'Created with initial status');
      }
      BookingProfitService.recalculateBookingProfitability(bookingId);
      return {
        duplicate: false,
        booking: BookingRepository.getBooking(bookingId),
        items: BookingRepository.listItems(bookingId),
        conflicts: conflicts
      };
    });
  }

  function insertItems(bookingId, items, actor, now) {
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      rows.push({
        booking_item_id: IdService.generateId('BKI'),
        booking_id: bookingId,
        source_type: item.sourceType,
        source_id: item.sourceId || '',
        item_name: item.itemName,
        description: item.description || '',
        quantity: item.quantity,
        unit: item.unit || '',
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        estimated_unit_cost: item.estimatedUnitCost || 0,
        estimated_total_cost: item.estimatedTotalCost || 0,
        is_taxable: !!item.isTaxable,
        is_discountable: item.isDiscountable !== false,
        display_order: item.displayOrder || i + 1,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
    }
    RepositoryService.batchAppend(SheetSchemaService.SHEET_BOOKING_ITEMS, rows);
  }

  function updateBooking(payload) {
    assertDatabase();
    var bookingId = payload.bookingId;
    var record = requireBooking(bookingId);
    var repricing = payload.reprice === true;
    var validated = validateBookingPayload(Object.assign({}, payload, {
      bookingTitle: payload.bookingTitle !== undefined ? payload.bookingTitle : record.booking_title,
      clientId: payload.clientId !== undefined ? payload.clientId : record.client_id,
      serviceType: payload.serviceType !== undefined ? payload.serviceType : record.service_type
    }));

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var patch = {
        booking_title: validated.title,
        client_id: payload.clientId !== undefined ? payload.clientId : record.client_id,
        lead_id: payload.leadId !== undefined ? payload.leadId : record.lead_id,
        service_type: payload.serviceType !== undefined ? payload.serviceType : record.service_type,
        event_type: payload.eventType !== undefined ? payload.eventType : record.event_type,
        event_date: payload.eventDate !== undefined ? payload.eventDate : record.event_date,
        event_start_time: payload.eventStartTime !== undefined ? payload.eventStartTime : record.event_start_time,
        event_end_time: payload.eventEndTime !== undefined ? payload.eventEndTime : record.event_end_time,
        setup_time: payload.setupTime !== undefined ? Number(payload.setupTime || 0) : record.setup_time,
        venue_name: payload.venueName !== undefined ? ValidationService.trimSafe(payload.venueName) : record.venue_name,
        venue_address: payload.venueAddress !== undefined ? ValidationService.trimSafe(payload.venueAddress) : record.venue_address,
        city_municipality: payload.cityMunicipality !== undefined ? ValidationService.trimSafe(payload.cityMunicipality) : record.city_municipality,
        province: payload.province !== undefined ? ValidationService.trimSafe(payload.province) : record.province,
        venue_contact_name: payload.venueContactName !== undefined ? ValidationService.trimSafe(payload.venueContactName) : record.venue_contact_name,
        venue_contact_number: payload.venueContactNumber !== undefined ? ClientRepository.normalizePhone(payload.venueContactNumber) : record.venue_contact_number,
        source_channel: payload.sourceChannel !== undefined ? payload.sourceChannel : record.source_channel,
        partner_id: payload.partnerId !== undefined ? payload.partnerId : record.partner_id,
        assigned_owner: payload.assignedOwner !== undefined ? ValidationService.trimSafe(payload.assignedOwner) : record.assigned_owner,
        special_instructions: payload.specialInstructions !== undefined ? ValidationService.trimSafe(payload.specialInstructions) : record.special_instructions,
        internal_notes: payload.internalNotes !== undefined ? ValidationService.trimSafe(payload.internalNotes) : record.internal_notes,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };

      if (repricing) {
        var pricing = buildPricingPayload(Object.assign({}, payload, {
          packageId: payload.packageId !== undefined ? payload.packageId : record.package_id,
          addOnIds: payload.addOnIds || (payload.packageId !== undefined ? [] : undefined)
        }));
        var pricingResult = BookingPricingService.calculatePricing(pricing);
        RepositoryService.clearRowsByField(SheetSchemaService.SHEET_BOOKING_ITEMS, 'booking_id', bookingId);
        insertItems(bookingId, pricingResult.items, actor, now);
        Object.assign(patch, {
          package_id: payload.packageId !== undefined ? payload.packageId : record.package_id,
          package_name_snapshot: (pricing.package || {}).name || '',
          package_price_snapshot: (pricing.package || {}).basePrice !== undefined ? Number((pricing.package || {}).basePrice) : 0,
          package_duration_snapshot: (pricing.package || {}).durationHours || '',
          subtotal: pricingResult.subtotal,
          add_on_total: pricingResult.addOnTotal,
          custom_charge_total: pricingResult.customChargeTotal,
          transportation_charge: pricingResult.transportationCharge,
          discount_type: pricingResult.discountType,
          discount_value: pricingResult.discountValue,
          discount_amount: pricingResult.discountAmount,
          gross_booking_amount: pricingResult.grossBookingAmount,
          planned_partner_commission: pricingResult.plannedPartnerCommission,
          net_contract_amount: pricingResult.netContractAmount,
          estimated_direct_cost: pricingResult.estimatedDirectCost,
          estimated_gross_profit: pricingResult.estimatedGrossProfit,
          estimated_profit_margin: pricingResult.estimatedProfitMargin
        });
        var paid = ReceivableService.getBookingPaid(bookingId);
        patch.balance_due_cached = BookingPricingService.round2(pricingResult.grossBookingAmount - paid);
        patch.payment_status = ReceivableService.computePaymentStatus(pricingResult.grossBookingAmount, paid, bookingId);
        AuditService.info(AuditService.ACTIONS.BOOKING_PRICING_UPDATED, 'Bookings', bookingId,
          'Booking pricing updated. New total: ' + pricingResult.grossBookingAmount + '.');
      }

RepositoryService.updateById(SheetSchemaService.SHEET_BOOKINGS, bookingId, patch);
      AuditService.info(AuditService.ACTIONS.BOOKING_UPDATED, 'Bookings', bookingId,
        'Updated booking "' + validated.title + '".');
      BookingProfitService.recalculateBookingProfitability(bookingId);
      mirrorCalendar(bookingId);
      return { booking: BookingRepository.getBooking(bookingId), items: BookingRepository.listItems(bookingId) };
    });
  }

  /**
   * Best-effort calendar mirror hook: never throws, never blocks the
   * booking mutation. Mirrors eligible statuses; removes the event for
   * CANCELLED/ARCHIVED. See docs/PRODUCT_REQUIREMENTS.md §8.
   */
  function mirrorCalendar(bookingId) {
    try {
      var booking = BookingRepository.getBooking(bookingId);
      if (!booking) {
        return;
      }
      var status = String(booking.bookingStatus || '');
      if (status === 'CANCELLED' || status === 'ARCHIVED') {
        CalendarSyncService.removeBookingEvent(booking);
        return;
      }
      if (CalendarSyncService.isEligible(booking)) {
        CalendarSyncService.syncBooking(booking);
      }
    } catch (ignored) {
      LoggerService.warn('BookingService.mirrorCalendar', 'Calendar mirror skipped', { bookingId: bookingId });
    }
  }

  function changeBookingStatus(payload) {
    assertDatabase();
    var bookingId = payload.bookingId;
    var record = requireBooking(bookingId);
    var target = payload.bookingStatus;
    var statusCheck = ValidationService.isEnum(target, BookingStatusService.STATUSES, 'Booking status');
    if (!statusCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_INVALID_STATUS, statusCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    BookingStatusService.validateTransition(record.booking_status, target, payload.reason);
    BookingStatusService.validateTransitionPreconditions(record, target, payload.reason, payload.overrideReason);

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var patch = {
        booking_status: target,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      if (target === 'CANCELLED') {
        patch.cancellation_reason = ValidationService.trimSafe(payload.reason);
        patch.cancelled_at = now;
        patch.cancelled_by = actor.userId;
      }
      if (target === 'COMPLETED') {
        patch.completed_at = now;
      }
      if (target === 'TENTATIVE' && (String(record.booking_status) === 'CANCELLED' || String(record.booking_status) === 'ARCHIVED')) {
        patch.cancellation_reason = '';
        patch.cancelled_at = '';
        patch.cancelled_by = '';
      }
      RepositoryService.updateById(SheetSchemaService.SHEET_BOOKINGS, bookingId, patch);
      BookingStatusService.recordStatusChange(bookingId, record.booking_status, target, payload.reason);
if (target === 'CANCELLED') {
        AuditService.info(AuditService.ACTIONS.BOOKING_CANCELLED, 'Bookings', bookingId,
          'Booking cancelled. Payments preserved; refund review required if paid.');
      }
      mirrorCalendar(bookingId);
      return BookingRepository.getBooking(bookingId);
    });
  }

  function cancelBooking(payload) {
    assertDatabase();
    var record = requireBooking(payload.bookingId);
    if (String(record.booking_status) === 'CANCELLED') {
      throw ErrorService.create(ErrorService.CODES.BOOKING_ALREADY_CANCELLED, 'This booking is already cancelled.', null, ErrorService.CATEGORY_CONFLICT);
    }
    var reason = ValidationService.trimSafe(payload.reason);
    if (!reason) {
      throw ErrorService.create(ErrorService.CODES.BOOKING_CANCEL_REASON_REQUIRED,
        'A cancellation reason is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return changeBookingStatus({ bookingId: payload.bookingId, bookingStatus: 'CANCELLED', reason: reason });
  }

  function archiveBooking(payload) {
    assertDatabase();
    var record = requireBooking(payload.bookingId);
    if (String(record.booking_status) === 'ARCHIVED') {
      throw ErrorService.create(ErrorService.CODES.BOOKING_ALREADY_ARCHIVED, 'This booking is already archived.', null, ErrorService.CATEGORY_CONFLICT);
    }
    return changeBookingStatus({ bookingId: payload.bookingId, bookingStatus: 'ARCHIVED', reason: payload.reason });
  }

  function reactivateBooking(bookingId, reason) {
    assertDatabase();
    var record = requireBooking(bookingId);
    if (String(record.booking_status) !== 'ARCHIVED' && String(record.booking_status) !== 'CANCELLED') {
      return BookingRepository.getBooking(bookingId);
    }
    return changeBookingStatus({ bookingId: bookingId, bookingStatus: 'TENTATIVE', reason: reason });
  }

  function rescheduleBooking(payload) {
    assertDatabase();
    var bookingId = payload.bookingId;
    var record = requireBooking(bookingId);
    if (!payload.eventDate) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A new event date is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var dateCheck = ValidationService.isDate(payload.eventDate, 'New event date');
    if (!dateCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, dateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    validateTime(payload.eventStartTime, 'Event start time');
    validateTime(payload.eventEndTime, 'Event end time');
    if (String(record.booking_status) === 'CONFIRMED' && !ValidationService.trimSafe(payload.reason)) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        'A reason is required when rescheduling a confirmed booking.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var conflicts = BookingConflictService.checkConflicts({
      eventDate: payload.eventDate,
      eventStartTime: payload.eventStartTime || record.event_start_time,
      eventEndTime: payload.eventEndTime || record.event_end_time,
      setupTime: payload.setupTime !== undefined ? payload.setupTime : record.setup_time,
      serviceType: record.service_type,
      assignedOwner: record.assigned_owner,
      excludeBookingId: bookingId
    });
    var overrideReason = ValidationService.trimSafe(payload.overrideReason);
    if (conflicts.length > 0 && !overrideReason) {
      throw ErrorService.create(ErrorService.CODES.SCHEDULE_CONFLICT,
        'The new schedule conflicts with another booking. Provide an override reason to continue.',
        { conflicts: conflicts }, ErrorService.CATEGORY_CONFLICT);
    }

    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      BookingRepository.appendScheduleHistory({
        schedule_history_id: IdService.generateId('SCH'),
        booking_id: bookingId,
        previous_event_date: record.event_date || '',
        previous_start_time: record.event_start_time || '',
        previous_end_time: record.event_end_time || '',
        new_event_date: payload.eventDate,
        new_start_time: payload.eventStartTime || record.event_start_time || '',
        new_end_time: payload.eventEndTime || record.event_end_time || '',
        reason: ValidationService.trimSafe(payload.reason) || '',
        changed_at: now,
        changed_by: actor.userId
      });
      RepositoryService.updateById(SheetSchemaService.SHEET_BOOKINGS, bookingId, {
        event_date: payload.eventDate,
        event_start_time: payload.eventStartTime || record.event_start_time || '',
        event_end_time: payload.eventEndTime || record.event_end_time || '',
        setup_time: payload.setupTime !== undefined ? Number(payload.setupTime || 0) : record.setup_time,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      if (conflicts.length > 0 && overrideReason) {
        AuditService.info(AuditService.ACTIONS.BOOKING_CONFLICT_OVERRIDE, 'Bookings', bookingId,
          'Rescheduled with ' + conflicts.length + ' conflict(s) overridden. Reason: ' + overrideReason + '.');
      }
AuditService.info(AuditService.ACTIONS.BOOKING_RESCHEDULED, 'Bookings', bookingId,
        'Booking rescheduled from ' + (record.event_date || '?') + ' to ' + payload.eventDate + '.');
      BookingProfitService.recalculateBookingProfitability(bookingId);
      mirrorCalendar(bookingId);
      return { booking: BookingRepository.getBooking(bookingId), conflicts: conflicts };
    });
  }

  function checkBookingConflicts(payload) {
    assertDatabase();
    return BookingConflictService.checkConflicts(payload || {});
  }

  /**
   * Booking summary for dashboards (counts + receivable totals).
   */
  function getBookingSummary() {
    assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var today = DateService.toIsoDate(DateService.now());
    var in14Days = DateService.toIsoDate(new Date(Date.now() + 14 * 24 * 3600 * 1000));
    var summary = {
      upcomingEvents: 0,
      confirmedBookings: 0,
      outstandingReceivables: 0,
      paymentsThisMonth: 0,
      unpaidConfirmed: 0,
      overpayments: 0,
      missingEventDetails: 0,
      refundReviews: 0
    };
    var currentMonth = today.substring(0, 7);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var status = String(r.booking_status);
      if (status === 'CANCELLED' || status === 'ARCHIVED') {
        continue;
      }
      var eventDate = String(r.event_date || '');
      if (eventDate && eventDate >= today && eventDate <= in14Days) {
        summary.upcomingEvents++;
      }
      if (status === 'CONFIRMED') {
        summary.confirmedBookings++;
        if (Number(r.balance_due_cached || 0) > 0) {
          summary.unpaidConfirmed++;
        }
      }
      var balance = Number(r.balance_due_cached || 0);
      if (balance < -0.005) {
        summary.overpayments++;
      }
      if (!eventDate) {
        summary.missingEventDetails++;
      }
      if (status === 'CANCELLED' && Number(r.amount_paid_cached || 0) > 0) {
        summary.refundReviews++;
      }
    }
    summary.outstandingReceivables = ReceivableService.getOutstandingTotal();
    var payments = RepositoryService.readAll(SheetSchemaService.SHEET_PAYMENTS);
    for (var p = 0; p < payments.length; p++) {
      if (String(payments[p].status) === 'VOIDED') {
        continue;
      }
      if (String(payments[p].payment_date || '').substring(0, 7) === currentMonth) {
        summary.paymentsThisMonth += Number(payments[p].amount || 0);
      }
    }
    return summary;
  }

  /**
   * Compares cached booking balances against calculated receivables.
   * Optional repair rewrites the caches and audits the fix.
   */
  function verifyBookingBalances(repair) {
    assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_BOOKINGS);
    var results = [];
    var mismatches = 0;
    var actor = AuditService.getActor();
    var now = DateService.nowIso();
    var updates = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var gross = Number(r.gross_booking_amount || 0);
      var paid = ReceivableService.getBookingPaid(r.booking_id);
      var expectedBalance = BookingPricingService.round2(gross - paid);
      var expectedStatus = ReceivableService.computePaymentStatus(gross, paid, r.booking_id);
      var cachedBalance = Number(r.balance_due_cached || 0);
      var cachedPaid = Number(r.amount_paid_cached || 0);
      var matches = Math.abs(cachedBalance - expectedBalance) < 0.005 && Math.abs(cachedPaid - paid) < 0.005;
      if (!matches) {
        mismatches++;
        results.push({
          bookingId: r.booking_id,
          cachedPaid: cachedPaid,
          calculatedPaid: paid,
          cachedBalance: cachedBalance,
          calculatedBalance: expectedBalance,
          matches: false
        });
        if (repair) {
          updates.push({
            id: r.booking_id,
            patch: {
              amount_paid_cached: paid,
              balance_due_cached: expectedBalance,
              payment_status: expectedStatus,
              updated_at: now,
              updated_by: actor.userId
            }
          });
        }
      } else {
        results.push({
          bookingId: r.booking_id,
          cachedPaid: cachedPaid,
          calculatedPaid: paid,
          cachedBalance: cachedBalance,
          calculatedBalance: expectedBalance,
          matches: true
        });
      }
    }
    if (repair && updates.length > 0) {
      RepositoryService.batchUpdateById(SheetSchemaService.SHEET_BOOKINGS, updates);
      AuditService.info(AuditService.ACTIONS.BOOKING_BALANCE_REPAIRED, 'Bookings', '',
        'Repaired cached balances for ' + updates.length + ' booking(s).');
      ClientRepositoryUpdateTotals();
    }
    AuditService.info(AuditService.ACTIONS.RECEIVABLE_RECALCULATED, 'Bookings', '',
      'Booking balance verification completed with ' + mismatches + ' mismatch(es).',
      { metadata: { checked: records.length, mismatches: mismatches } });
    return { checked: records.length, mismatches: mismatches, results: results, repaired: repair ? updates.length : 0 };
  }

  function ClientRepositoryUpdateTotals() {
    ReceivableService.refreshClientCachedTotals();
  }

  return {
    createBooking: createBooking,
    updateBooking: updateBooking,
    changeBookingStatus: changeBookingStatus,
    cancelBooking: cancelBooking,
    archiveBooking: archiveBooking,
    reactivateBooking: reactivateBooking,
    rescheduleBooking: rescheduleBooking,
    checkBookingConflicts: checkBookingConflicts,
    getBookingSummary: getBookingSummary,
    verifyBookingBalances: verifyBookingBalances,
    buildPricingPayload: buildPricingPayload
  };
})();


