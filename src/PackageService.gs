/**
 * PackageService.gs
 * Service catalog: packages, package items, and add-ons (Sprint 2).
 *
 * Profitability is always calculated server-side. Packages are planning
 * estimates - creating or editing them NEVER posts revenue, expenses,
 * or inventory movements.
 */

var PackageService = (function () {
  'use strict';

  var SERVICE_TYPES = ['PHOTOBOOTH', 'PHOTOMAN', 'PHOTOGRAPHY', 'PRINTING', 'STUDIO_SERVICE', 'CUSTOM', 'OTHER'];
  var ITEM_TYPES = ['INCLUSION', 'SERVICE', 'CONSUMABLE_ESTIMATE', 'EQUIPMENT_REQUIREMENT', 'CREW_REQUIREMENT', 'DELIVERABLE', 'OTHER'];
  var COST_METHODS = ['MANUAL', 'PACKAGE_ITEMS'];

  function requirePackage(packageId) {
    var record = PackageRepository.findById(packageId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.PACKAGE_NOT_FOUND, 'The package was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  function requireAddOn(addOnId) {
    var record = PackageRepository.findAddOnById(addOnId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.ADD_ON_NOT_FOUND, 'The add-on was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    return record;
  }

  /**
   * Server-authoritative profitability.
   * When base price is zero, margin is 0 (unavailable by convention).
   */
  function calculateProfitability(basePrice, directCost) {
    var price = Number(basePrice) || 0;
    var cost = Number(directCost) || 0;
    var gross = price - cost;
    var margin = price > 0 ? (gross / price) * 100 : 0;
    return {
      expectedGrossProfit: Math.round(gross * 100) / 100,
      expectedProfitMargin: Math.round(margin * 100) / 100
    };
  }

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function assertUniqueActivePackageName(name, excludeId) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_PACKAGES);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.package_name).toLowerCase() !== String(name).toLowerCase()) {
        continue;
      }
      if (excludeId && String(r.package_id) === String(excludeId)) {
        continue;
      }
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (!inactive) {
        throw ErrorService.create(ErrorService.CODES.DUPLICATE_PACKAGE_NAME,
          'An active package with this name already exists.', null, ErrorService.CATEGORY_VALIDATION);
      }
    }
  }

  function validatePackagePayload(payload, forUpdate) {
    var name = ValidationService.trimSafe(payload.packageName);
    var nameCheck = ValidationService.isNonEmptyString(name, 'Package name', 150);
    if (!nameCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(payload.serviceType, SERVICE_TYPES, 'Service type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var basePrice = Number(payload.basePrice);
    var priceCheck = ValidationService.isNonNegativeAmount(basePrice, 'Base price');
    if (!priceCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_PRICE, priceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var cost = Number(payload.expectedDirectCost || 0);
    var costCheck = ValidationService.isNonNegativeAmount(cost, 'Expected direct cost');
    if (!costCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_COST, costCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    if (payload.durationHours !== undefined && payload.durationHours !== null && payload.durationHours !== '') {
      var duration = Number(payload.durationHours);
      if (!(duration > 0)) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'Duration must be greater than zero when applicable.', null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.extraHourRate !== undefined && payload.extraHourRate !== null && payload.extraHourRate !== '') {
      var rateCheck = ValidationService.isNonNegativeAmount(Number(payload.extraHourRate), 'Extra-hour rate');
      if (!rateCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, rateCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    if (payload.minimumBookingAmount !== undefined && payload.minimumBookingAmount !== null && payload.minimumBookingAmount !== '') {
      var minCheck = ValidationService.isNonNegativeAmount(Number(payload.minimumBookingAmount), 'Minimum booking amount');
      if (!minCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, minCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
    }
    var method = payload.costCalculationMethod || 'MANUAL';
    var methodCheck = ValidationService.isEnum(method, COST_METHODS, 'Cost calculation method');
    if (!methodCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, methodCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    return {
      name: name,
      basePrice: basePrice,
      cost: cost,
      method: method
    };
  }

  function createPackage(payload) {
    PackageRepository.assertDatabase();
    var validated = validatePackagePayload(payload || {}, false);
    assertUniqueActivePackageName(validated.name);
    return LockManager.run(function () {
      var packageId = IdService.generateId('PKG');
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var profit = calculateProfitability(validated.basePrice, validated.cost);
      var record = {
        package_id: packageId,
        package_code: packageId,
        package_name: validated.name,
        service_type: payload.serviceType,
        description: ValidationService.trimSafe(payload.description),
        base_price: validated.basePrice,
        duration_hours: payload.durationHours !== undefined && payload.durationHours !== '' ? Number(payload.durationHours) : '',
        expected_direct_cost: validated.cost,
        expected_gross_profit: profit.expectedGrossProfit,
        expected_profit_margin: profit.expectedProfitMargin,
        extra_hour_rate: payload.extraHourRate !== undefined && payload.extraHourRate !== '' ? Number(payload.extraHourRate) : 0,
        minimum_booking_amount: payload.minimumBookingAmount !== undefined && payload.minimumBookingAmount !== '' ? Number(payload.minimumBookingAmount) : 0,
        cost_calculation_method: validated.method,
        is_customizable: !!payload.isCustomizable,
        is_featured: !!payload.isFeatured,
        is_active: true,
        display_order: Number(payload.displayOrder) || 0,
        terms_summary: ValidationService.trimSafe(payload.termsSummary),
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      };
      RepositoryService.appendRecord(SheetSchemaService.SHEET_PACKAGES, record);
      AuditService.info(AuditService.ACTIONS.PACKAGE_CREATED, 'Packages', packageId,
        'Created package "' + validated.name + '" (' + payload.serviceType + '), price ' + validated.basePrice + '.');
      return PackageRepository.getPackage(packageId);
    });
  }

  function updatePackage(payload) {
    PackageRepository.assertDatabase();
    var packageId = payload.packageId;
    var record = requirePackage(packageId);
    var validated = validatePackagePayload(Object.assign({}, payload, {
      packageName: payload.packageName !== undefined ? payload.packageName : record.package_name,
      serviceType: payload.serviceType !== undefined ? payload.serviceType : record.service_type,
      basePrice: payload.basePrice !== undefined ? payload.basePrice : record.base_price,
      expectedDirectCost: payload.expectedDirectCost !== undefined ? payload.expectedDirectCost : record.expected_direct_cost
    }), true);
    assertUniqueActivePackageName(validated.name, packageId);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var cost = validated.cost;
      if (validated.method === 'PACKAGE_ITEMS') {
        cost = PackageRepository.itemsTotalCost(packageId);
      }
      var profit = calculateProfitability(validated.basePrice, cost);
      var patch = {
        package_name: validated.name,
        service_type: payload.serviceType !== undefined ? payload.serviceType : record.service_type,
        description: payload.description !== undefined ? ValidationService.trimSafe(payload.description) : record.description,
        base_price: validated.basePrice,
        duration_hours: payload.durationHours !== undefined && payload.durationHours !== '' ? Number(payload.durationHours) : record.duration_hours,
        expected_direct_cost: cost,
        expected_gross_profit: profit.expectedGrossProfit,
        expected_profit_margin: profit.expectedProfitMargin,
        extra_hour_rate: payload.extraHourRate !== undefined && payload.extraHourRate !== '' ? Number(payload.extraHourRate) : record.extra_hour_rate,
        minimum_booking_amount: payload.minimumBookingAmount !== undefined && payload.minimumBookingAmount !== '' ? Number(payload.minimumBookingAmount) : record.minimum_booking_amount,
        cost_calculation_method: validated.method,
        is_customizable: payload.isCustomizable !== undefined ? !!payload.isCustomizable : record.is_customizable,
        is_featured: payload.isFeatured !== undefined ? !!payload.isFeatured : record.is_featured,
        display_order: payload.displayOrder !== undefined ? Number(payload.displayOrder) || 0 : record.display_order,
        terms_summary: payload.termsSummary !== undefined ? ValidationService.trimSafe(payload.termsSummary) : record.terms_summary,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      RepositoryService.updateById(SheetSchemaService.SHEET_PACKAGES, packageId, patch);
      AuditService.info(AuditService.ACTIONS.PACKAGE_UPDATED, 'Packages', packageId,
        'Updated package "' + validated.name + '".');
      return PackageRepository.getPackage(packageId);
    });
  }

  function deactivatePackage(payload) {
    PackageRepository.assertDatabase();
    var packageId = payload.packageId;
    var record = requirePackage(packageId);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_PACKAGES, packageId, {
        is_active: false,
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PACKAGE_DEACTIVATED, 'Packages', packageId,
        'Deactivated package "' + record.package_name + '". Historical references remain valid.');
      return PackageRepository.getPackage(packageId);
    });
  }

  function reactivatePackage(packageId) {
    PackageRepository.assertDatabase();
    var record = requirePackage(packageId);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_PACKAGES, packageId, {
        is_active: true,
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.PACKAGE_REACTIVATED, 'Packages', packageId,
        'Reactivated package "' + record.package_name + '".');
      return PackageRepository.getPackage(packageId);
    });
  }

  /* ------------------- Package items ------------------- */

  var ITEM_FIELDS = ['itemName', 'itemType', 'description', 'quantity', 'unit', 'estimatedUnitCost'];

  /**
   * Saves a package's full item list atomically (replace-all under one
   * lock). Items are editor-owned, non-financial rows; historical
   * booking snapshots are a future concern and are not affected.
   */
  function savePackageItems(payload) {
    PackageRepository.assertDatabase();
    var packageId = payload.packageId;
    var record = requirePackage(packageId);
    var items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      throw ErrorService.create(ErrorService.CODES.PACKAGE_ITEM_VALIDATION_ERROR,
        'At least one package item is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    var seen = {};
    var rows = [];
    var actor = AuditService.getActor();
    var now = DateService.nowIso();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var itemName = ValidationService.trimSafe(item.itemName);
      if (!itemName) {
        throw ErrorService.create(ErrorService.CODES.PACKAGE_ITEM_VALIDATION_ERROR,
          'Item name is required on every row.', null, ErrorService.CATEGORY_VALIDATION);
      }
      var key = itemName.toLowerCase();
      if (seen[key]) {
        throw ErrorService.create(ErrorService.CODES.PACKAGE_ITEM_VALIDATION_ERROR,
          'Duplicate item "' + itemName + '" was found in the list.', null, ErrorService.CATEGORY_VALIDATION);
      }
      seen[key] = true;
      var typeCheck = ValidationService.isEnum(item.itemType || 'INCLUSION', ITEM_TYPES, 'Item type');
      if (!typeCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.PACKAGE_ITEM_VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
      var quantity = Number(item.quantity || 1);
      if (!(quantity > 0)) {
        throw ErrorService.create(ErrorService.CODES.PACKAGE_ITEM_VALIDATION_ERROR,
          'Quantity must be greater than zero for "' + itemName + '".', null, ErrorService.CATEGORY_VALIDATION);
      }
      var unitCost = Number(item.estimatedUnitCost || 0);
      if (unitCost < 0) {
        throw ErrorService.create(ErrorService.CODES.PACKAGE_ITEM_VALIDATION_ERROR,
          'Estimated unit cost cannot be negative for "' + itemName + '".', null, ErrorService.CATEGORY_VALIDATION);
      }
      rows.push({
        package_item_id: IdService.generateId('PKI'),
        package_id: packageId,
        item_name: itemName,
        item_type: item.itemType || 'INCLUSION',
        description: ValidationService.trimSafe(item.description),
        quantity: quantity,
        unit: ValidationService.trimSafe(item.unit),
        estimated_unit_cost: round2(unitCost),
        estimated_total_cost: round2(unitCost * quantity),
        is_optional: !!item.isOptional,
        is_visible_to_client: item.isVisibleToClient !== false,
        display_order: i + 1,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
    }
    return LockManager.run(function () {
      var removed = RepositoryService.clearRowsByField(SheetSchemaService.SHEET_PACKAGE_ITEMS, 'package_id', packageId);
      RepositoryService.batchAppend(SheetSchemaService.SHEET_PACKAGE_ITEMS, rows);
      var itemTotal = PackageRepository.itemsTotalCost(packageId);
      if (String(record.cost_calculation_method) === 'PACKAGE_ITEMS') {
        var profit = calculateProfitability(Number(record.base_price || 0), itemTotal);
        RepositoryService.updateById(SheetSchemaService.SHEET_PACKAGES, packageId, {
          expected_direct_cost: itemTotal,
          expected_gross_profit: profit.expectedGrossProfit,
          expected_profit_margin: profit.expectedProfitMargin,
          updated_at: now,
          updated_by: actor.userId
        });
      }
      AuditService.info(AuditService.ACTIONS.PACKAGE_ITEMS_UPDATED, 'PackageItems', packageId,
        'Saved ' + rows.length + ' item(s) for package "' + record.package_name + '". Estimated item cost total: ' + itemTotal + '.',
        { metadata: { itemCount: rows.length, totalCost: itemTotal } });
      return {
        package: PackageRepository.getPackage(packageId),
        items: PackageRepository.listItems(packageId),
        itemsTotalCost: itemTotal
      };
    });
  }

  /* ------------------- Add-ons ------------------- */

  function assertUniqueActiveAddOnName(name, excludeId) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_PACKAGE_ADD_ONS);
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.add_on_name).toLowerCase() !== String(name).toLowerCase()) {
        continue;
      }
      if (excludeId && String(r.add_on_id) === String(excludeId)) {
        continue;
      }
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (!inactive) {
        throw ErrorService.create(ErrorService.CODES.DUPLICATE_ADD_ON_NAME,
          'An active add-on with this name already exists.', null, ErrorService.CATEGORY_VALIDATION);
      }
    }
  }

  function createAddOn(payload) {
    PackageRepository.assertDatabase();
    var name = ValidationService.trimSafe(payload.addOnName);
    var nameCheck = ValidationService.isNonEmptyString(name, 'Add-on name', 150);
    if (!nameCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(payload.serviceType || 'OTHER', SERVICE_TYPES, 'Service type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var price = Number(payload.sellingPrice);
    var priceCheck = ValidationService.isNonNegativeAmount(price, 'Selling price');
    if (!priceCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_PRICE, priceCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var cost = Number(payload.estimatedDirectCost || 0);
    var costCheck = ValidationService.isNonNegativeAmount(cost, 'Estimated direct cost');
    if (!costCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_COST, costCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    assertUniqueActiveAddOnName(name);
    return LockManager.run(function () {
      var addOnId = IdService.generateId('ADD');
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var profit = calculateProfitability(price, cost);
      RepositoryService.appendRecord(SheetSchemaService.SHEET_PACKAGE_ADD_ONS, {
        add_on_id: addOnId,
        add_on_code: addOnId,
        add_on_name: name,
        service_type: payload.serviceType || 'OTHER',
        description: ValidationService.trimSafe(payload.description),
        selling_price: price,
        estimated_direct_cost: cost,
        expected_gross_profit: profit.expectedGrossProfit,
        expected_profit_margin: profit.expectedProfitMargin,
        unit: ValidationService.trimSafe(payload.unit),
        is_active: true,
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId,
        version: 1
      });
      AuditService.info(AuditService.ACTIONS.ADD_ON_CREATED, 'PackageAddOns', addOnId,
        'Created add-on "' + name + '", price ' + price + '.');
      return PackageRepository.getAddOn(addOnId);
    });
  }

  function updateAddOn(payload) {
    PackageRepository.assertDatabase();
    var addOnId = payload.addOnId;
    var record = requireAddOn(addOnId);
    var name = payload.addOnName !== undefined ? ValidationService.trimSafe(payload.addOnName) : record.add_on_name;
    if (!name) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, 'Add-on name is required.', null, ErrorService.CATEGORY_VALIDATION);
    }
    assertUniqueActiveAddOnName(name, addOnId);
    var price = payload.sellingPrice !== undefined ? Number(payload.sellingPrice) : Number(record.selling_price || 0);
    var cost = payload.estimatedDirectCost !== undefined ? Number(payload.estimatedDirectCost) : Number(record.estimated_direct_cost || 0);
    if (price < 0) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_PRICE, 'Selling price cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    if (cost < 0) {
      throw ErrorService.create(ErrorService.CODES.INVALID_PACKAGE_COST, 'Estimated direct cost cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      var now = DateService.nowIso();
      var profit = calculateProfitability(price, cost);
      var patch = {
        add_on_name: name,
        service_type: payload.serviceType !== undefined ? payload.serviceType : record.service_type,
        description: payload.description !== undefined ? ValidationService.trimSafe(payload.description) : record.description,
        selling_price: price,
        estimated_direct_cost: cost,
        expected_gross_profit: profit.expectedGrossProfit,
        expected_profit_margin: profit.expectedProfitMargin,
        unit: payload.unit !== undefined ? ValidationService.trimSafe(payload.unit) : record.unit,
        updated_at: now,
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      };
      RepositoryService.updateById(SheetSchemaService.SHEET_PACKAGE_ADD_ONS, addOnId, patch);
      AuditService.info(AuditService.ACTIONS.ADD_ON_UPDATED, 'PackageAddOns', addOnId, 'Updated add-on "' + name + '".');
      return PackageRepository.getAddOn(addOnId);
    });
  }

  function deactivateAddOn(payload) {
    PackageRepository.assertDatabase();
    var addOnId = payload.addOnId;
    var record = requireAddOn(addOnId);
    return LockManager.run(function () {
      var actor = AuditService.getActor();
      RepositoryService.updateById(SheetSchemaService.SHEET_PACKAGE_ADD_ONS, addOnId, {
        is_active: false,
        updated_at: DateService.nowIso(),
        updated_by: actor.userId,
        version: Number(record.version || 1) + 1
      });
      AuditService.info(AuditService.ACTIONS.ADD_ON_DEACTIVATED, 'PackageAddOns', addOnId,
        'Deactivated add-on "' + record.add_on_name + '".');
      return PackageRepository.getAddOn(addOnId);
    });
  }

  /**
   * Package summary for dashboards (counts only).
   */
  function getPackageSummary() {
    PackageRepository.assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_PACKAGES);
    var active = 0;
    var featured = 0;
    var priceSum = 0;
    var marginSum = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var inactive = String(r.is_active) === 'FALSE' || r.is_active === false;
      if (inactive) {
        continue;
      }
      active++;
      if (String(r.is_featured) === 'TRUE' || r.is_featured === true) {
        featured++;
      }
      priceSum += Number(r.base_price || 0);
      marginSum += Number(r.expected_profit_margin || 0);
    }
    return {
      activePackages: active,
      featuredPackages: featured,
      averageSellingPrice: active > 0 ? Math.round((priceSum / active) * 100) / 100 : 0,
      averageExpectedMargin: active > 0 ? Math.round((marginSum / active) * 10000) / 100 : 0
    };
  }

  return {
    createPackage: createPackage,
    updatePackage: updatePackage,
    deactivatePackage: deactivatePackage,
    reactivatePackage: reactivatePackage,
    savePackageItems: savePackageItems,
    createAddOn: createAddOn,
    updateAddOn: updateAddOn,
    deactivateAddOn: deactivateAddOn,
    calculateProfitability: calculateProfitability,
    getPackageSummary: getPackageSummary,
    SERVICE_TYPES: SERVICE_TYPES.slice(0),
    ITEM_TYPES: ITEM_TYPES.slice(0),
    COST_METHODS: COST_METHODS.slice(0)
  };
})();
