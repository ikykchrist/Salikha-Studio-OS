/**
 * BookingPricingService.gs
 * Server-authoritative booking pricing (Sprint 3).
 *
 * Order of calculation:
 *   subtotal = package price + add-ons + custom charges + transportation
 *   gross    = subtotal - discount
 *   netContract = gross - planned partner commission (internal planning)
 *   estProfit = gross - estimatedDirectCost
 *
 * Planned partner commission is NEVER deducted from the client-facing
 * total. Discounts are applied exactly once.
 */

var BookingPricingService = (function () {
  'use strict';

  var DISCOUNT_NONE = 'NONE';
  var DISCOUNT_FIXED = 'FIXED';
  var DISCOUNT_PERCENTAGE = 'PERCENTAGE';

  var ITEM_SOURCE_PACKAGE = 'PACKAGE_INCLUSION';
  var ITEM_SOURCE_ADD_ON = 'ADD_ON';
  var ITEM_SOURCE_CUSTOM = 'CUSTOM_CHARGE';
  var ITEM_SOURCE_TRANSPORT = 'TRANSPORTATION';
  var ITEM_SOURCE_DISCOUNT = 'DISCOUNT';
  var ITEM_SOURCE_OTHER = 'OTHER';

  var ITEM_SOURCE_TYPES = [
    ITEM_SOURCE_PACKAGE, ITEM_SOURCE_ADD_ON, ITEM_SOURCE_CUSTOM,
    ITEM_SOURCE_TRANSPORT, ITEM_SOURCE_DISCOUNT, ITEM_SOURCE_OTHER
  ];

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function money(value) {
    return Number(value || 0);
  }

  /**
   * Validates and computes the discount amount.
   * Returns { discountAmount, discountType, discountValue }.
   */
  function computeDiscount(subtotal, discountType, discountValue) {
    var type = discountType || DISCOUNT_NONE;
    var value = Number(discountValue || 0);
    if (type === DISCOUNT_NONE) {
      return { discountAmount: 0, discountType: DISCOUNT_NONE, discountValue: 0 };
    }
    if (type === DISCOUNT_FIXED) {
      if (value < 0) {
        throw ErrorService.create(ErrorService.CODES.INVALID_DISCOUNT,
          'Fixed discount cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
      }
      if (value > subtotal + 0.005) {
        throw ErrorService.create(ErrorService.CODES.INVALID_DISCOUNT,
          'Fixed discount cannot exceed the eligible subtotal.', null, ErrorService.CATEGORY_VALIDATION);
      }
      return { discountAmount: round2(value), discountType: DISCOUNT_FIXED, discountValue: round2(value) };
    }
    if (type === DISCOUNT_PERCENTAGE) {
      if (value < 0 || value > 100) {
        throw ErrorService.create(ErrorService.CODES.INVALID_DISCOUNT,
          'Percentage discount must be between 0 and 100.', null, ErrorService.CATEGORY_VALIDATION);
      }
      return {
        discountAmount: round2(subtotal * value / 100),
        discountType: DISCOUNT_PERCENTAGE,
        discountValue: round2(value)
      };
    }
    throw ErrorService.create(ErrorService.CODES.INVALID_DISCOUNT,
      'Discount type is not valid.', null, ErrorService.CATEGORY_VALIDATION);
  }

  function validateNonNegative(value, label) {
    if (value < 0) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
        label + ' cannot be negative.', null, ErrorService.CATEGORY_VALIDATION);
    }
  }

  /**
   * Builds the authoritative pricing result and item lines from a
   * structured payload:
   *   { package {packageId,name,basePrice,expectedDirectCost,durationHours},
   *     addOns: [{addOnId,name,sellingPrice,estimatedDirectCost}],
   *     customCharges: [{name,quantity,unitPrice,estimatedCost}],
   *     transportationCharge, discountType, discountValue,
   *     plannedPartnerCommission, manualEstimatedDirectCost }
   */
  function calculatePricing(payload) {
    var items = [];
    var subtotal = 0;
    var addOnTotal = 0;
    var customChargeTotal = 0;
    var estimatedCost = 0;
    var order = 0;

    // Package line
    var pkg = payload.package;
    if (pkg) {
      var packagePrice = money(pkg.basePrice);
      validateNonNegative(packagePrice, 'Package price');
      items.push({
        sourceType: ITEM_SOURCE_PACKAGE,
        sourceId: pkg.packageId || '',
        itemName: pkg.name || 'Package',
        description: 'Package base service',
        quantity: 1,
        unit: 'event',
        unitPrice: packagePrice,
        lineTotal: packagePrice,
        estimatedUnitCost: money(pkg.expectedDirectCost),
        estimatedTotalCost: money(pkg.expectedDirectCost),
        isTaxable: false,
        isDiscountable: true
      });
      subtotal += packagePrice;
      estimatedCost += money(pkg.expectedDirectCost);
      order++;
    }

    // Add-on lines
    var addOns = payload.addOns || [];
    for (var a = 0; a < addOns.length; a++) {
      var addOn = addOns[a];
      var price = money(addOn.sellingPrice);
      validateNonNegative(price, 'Add-on price');
      items.push({
        sourceType: ITEM_SOURCE_ADD_ON,
        sourceId: addOn.addOnId || '',
        itemName: addOn.name || 'Add-on',
        description: '',
        quantity: 1,
        unit: addOn.unit || 'unit',
        unitPrice: price,
        lineTotal: price,
        estimatedUnitCost: money(addOn.estimatedDirectCost),
        estimatedTotalCost: money(addOn.estimatedDirectCost),
        isTaxable: false,
        isDiscountable: true
      });
      subtotal += price;
      addOnTotal += price;
      estimatedCost += money(addOn.estimatedDirectCost);
      order++;
    }

    // Custom charge lines
    var customCharges = payload.customCharges || [];
    for (var c = 0; c < customCharges.length; c++) {
      var charge = customCharges[c];
      var chargeName = ValidationService.trimSafe(charge.name);
      if (!chargeName) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'Custom charge name is required.', null, ErrorService.CATEGORY_VALIDATION);
      }
      var quantity = Number(charge.quantity || 1);
      if (!(quantity > 0)) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR,
          'Custom charge quantity must be greater than zero.', null, ErrorService.CATEGORY_VALIDATION);
      }
      var unitPrice = money(charge.unitPrice);
      validateNonNegative(unitPrice, 'Custom charge price');
      var lineTotal = round2(unitPrice * quantity);
      var unitCost = money(charge.estimatedCost || 0);
      items.push({
        sourceType: ITEM_SOURCE_CUSTOM,
        sourceId: '',
        itemName: chargeName,
        description: ValidationService.trimSafe(charge.description),
        quantity: quantity,
        unit: ValidationService.trimSafe(charge.unit) || 'unit',
        unitPrice: unitPrice,
        lineTotal: lineTotal,
        estimatedUnitCost: unitCost,
        estimatedTotalCost: round2(unitCost * quantity),
        isTaxable: false,
        isDiscountable: true
      });
      subtotal += lineTotal;
      customChargeTotal += lineTotal;
      estimatedCost += round2(unitCost * quantity);
      order++;
    }

    // Transportation
    var transportation = money(payload.transportationCharge || 0);
    validateNonNegative(transportation, 'Transportation charge');
    if (transportation > 0) {
      items.push({
        sourceType: ITEM_SOURCE_TRANSPORT,
        sourceId: '',
        itemName: 'Transportation',
        description: 'Transportation charged to client',
        quantity: 1,
        unit: 'trip',
        unitPrice: transportation,
        lineTotal: transportation,
        estimatedUnitCost: 0,
        estimatedTotalCost: 0,
        isTaxable: false,
        isDiscountable: true
      });
      subtotal += transportation;
      order++;
    }

    // Discount line
    var discount = computeDiscount(subtotal, payload.discountType, payload.discountValue);
    if (discount.discountAmount > 0) {
      items.push({
        sourceType: ITEM_SOURCE_DISCOUNT,
        sourceId: '',
        itemName: 'Discount' + (discount.discountType === DISCOUNT_PERCENTAGE ? ' (' + discount.discountValue + '%)' : ''),
        description: '',
        quantity: 1,
        unit: '',
        unitPrice: -discount.discountAmount,
        lineTotal: -discount.discountAmount,
        estimatedUnitCost: 0,
        estimatedTotalCost: 0,
        isTaxable: false,
        isDiscountable: false
      });
      order++;
    }

    var gross = round2(subtotal - discount.discountAmount);
    if (gross < 0) {
      throw ErrorService.create(ErrorService.CODES.INVALID_DISCOUNT,
        'Discount cannot make the booking total negative.', null, ErrorService.CATEGORY_VALIDATION);
    }

    var commission = money(payload.plannedPartnerCommission || 0);
    validateNonNegative(commission, 'Planned partner commission');
    var netContract = round2(gross - commission);

    var directCost = money(payload.manualEstimatedDirectCost);
    if (payload.estimatedDirectCostSource === 'CALCULATED' || payload.estimatedDirectCostSource === undefined) {
      directCost = round2(estimatedCost);
    }
    validateNonNegative(directCost, 'Estimated direct cost');

    var estProfit = round2(gross - directCost);
    var estMargin = gross > 0 ? round2((estProfit / gross) * 100) : 0;

    for (var i = 0; i < items.length; i++) {
      items[i].displayOrder = i + 1;
    }

    return {
      items: items,
      subtotal: subtotal,
      addOnTotal: addOnTotal,
      customChargeTotal: customChargeTotal,
      transportationCharge: transportation,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: discount.discountAmount,
      grossBookingAmount: gross,
      plannedPartnerCommission: commission,
      netContractAmount: netContract,
      estimatedDirectCost: directCost,
      estimatedGrossProfit: estProfit,
      estimatedProfitMargin: estMargin
    };
  }

  return {
    calculatePricing: calculatePricing,
    computeDiscount: computeDiscount,
    round2: round2,
    DISCOUNT_NONE: DISCOUNT_NONE,
    DISCOUNT_FIXED: DISCOUNT_FIXED,
    DISCOUNT_PERCENTAGE: DISCOUNT_PERCENTAGE,
    ITEM_SOURCE_PACKAGE: ITEM_SOURCE_PACKAGE,
    ITEM_SOURCE_ADD_ON: ITEM_SOURCE_ADD_ON,
    ITEM_SOURCE_CUSTOM: ITEM_SOURCE_CUSTOM,
    ITEM_SOURCE_TRANSPORT: ITEM_SOURCE_TRANSPORT,
    ITEM_SOURCE_DISCOUNT: ITEM_SOURCE_DISCOUNT,
    ITEM_SOURCE_OTHER: ITEM_SOURCE_OTHER,
    ITEM_SOURCE_TYPES: ITEM_SOURCE_TYPES.slice(0)
  };
})();
