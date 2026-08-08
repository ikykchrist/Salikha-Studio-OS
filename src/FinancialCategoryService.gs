/**
 * FinancialCategoryService.gs
 * Financial category master data: CRUD plus carefully selected system
 * defaults. System categories are protected from deletion.
 */

var FinancialCategoryService = (function () {
  'use strict';

  var TYPE_INCOME = 'INCOME';
  var TYPE_DIRECT_COST = 'DIRECT_COST';
  var TYPE_OPERATING_EXPENSE = 'OPERATING_EXPENSE';
  var TYPE_CAPITAL_EXPENSE = 'CAPITAL_EXPENSE';
  var TYPE_OWNER_CAPITAL = 'OWNER_CAPITAL';
  var TYPE_OWNER_WITHDRAWAL = 'OWNER_WITHDRAWAL';
  var TYPE_TRANSFER = 'TRANSFER';
  var TYPE_REFUND = 'REFUND';
  var TYPE_ADJUSTMENT = 'ADJUSTMENT';

  var TYPES = [
    TYPE_INCOME,
    TYPE_DIRECT_COST,
    TYPE_OPERATING_EXPENSE,
    TYPE_CAPITAL_EXPENSE,
    TYPE_OWNER_CAPITAL,
    TYPE_OWNER_WITHDRAWAL,
    TYPE_TRANSFER,
    TYPE_REFUND,
    TYPE_ADJUSTMENT
  ];

  var SPRINT_1_TYPES = [
    TYPE_INCOME,
    TYPE_OPERATING_EXPENSE,
    TYPE_CAPITAL_EXPENSE,
    TYPE_OWNER_CAPITAL,
    TYPE_OWNER_WITHDRAWAL,
    TYPE_TRANSFER,
    TYPE_ADJUSTMENT
  ];

  /**
   * Default category templates. Names are keys so they stay stable.
   * is_system protects them from deletion/deactivation by users.
   */
  var DEFAULT_CATEGORIES = [
    { key: 'INCOME_GENERAL', name: 'General Business Income', type: TYPE_INCOME, system: true },
    { key: 'INCOME_OTHER', name: 'Other Income', type: TYPE_INCOME, system: false },

    { key: 'OPEX_TRANSPORT', name: 'Transportation', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_CREW_MEALS', name: 'Crew Meals', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_MARKETING', name: 'Marketing', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_ELECTRICITY', name: 'Electricity', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_INTERNET', name: 'Internet', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_SOFTWARE', name: 'Software', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_REPAIRS', name: 'Repairs and Maintenance', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_OFFICE_SUPPLIES', name: 'Office Supplies', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_GENERAL_SUPPLIES', name: 'General Supplies', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_RENT', name: 'Rent', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_PERMITS', name: 'Permits and Fees', type: TYPE_OPERATING_EXPENSE, system: false },
    { key: 'OPEX_MISC', name: 'Miscellaneous Operating Expense', type: TYPE_OPERATING_EXPENSE, system: false },

    { key: 'CAPEX_EQUIPMENT', name: 'Equipment Purchase', type: TYPE_CAPITAL_EXPENSE, system: false },
    { key: 'CAPEX_COMPUTER', name: 'Computer Equipment', type: TYPE_CAPITAL_EXPENSE, system: false },
    { key: 'CAPEX_CAMERA', name: 'Camera Equipment', type: TYPE_CAPITAL_EXPENSE, system: false },
    { key: 'CAPEX_PRINTER', name: 'Printer Equipment', type: TYPE_CAPITAL_EXPENSE, system: false },
    { key: 'CAPEX_LIGHTING', name: 'Lighting Equipment', type: TYPE_CAPITAL_EXPENSE, system: false },
    { key: 'CAPEX_FURNITURE', name: 'Furniture and Fixtures', type: TYPE_CAPITAL_EXPENSE, system: false },

    { key: 'OWNER_CAPITAL', name: 'Owner Capital', type: TYPE_OWNER_CAPITAL, system: true },
    { key: 'OWNER_WITHDRAWAL', name: 'Owner Withdrawal', type: TYPE_OWNER_WITHDRAWAL, system: true },
    { key: 'OWNER_REIMBURSEMENT', name: 'Owner Reimbursement', type: TYPE_OWNER_CAPITAL, system: false },

    { key: 'TRANSFER', name: 'Account Transfer', type: TYPE_TRANSFER, system: true },
    { key: 'OPENING_BALANCE', name: 'Opening Balance', type: TYPE_ADJUSTMENT, system: true },
    { key: 'ADJUSTMENT', name: 'Financial Adjustment', type: TYPE_ADJUSTMENT, system: true },

    { key: 'BOOKING_PAYMENT', name: 'Client Booking Payment', type: TYPE_INCOME, system: true },
    { key: 'CLIENT_REFUND', name: 'Client Refund', type: TYPE_REFUND, system: true }
  ];

  var CACHE_KEY = 'salikha_categories_v1';
  var CACHE_TTL_SECONDS = 300;

  function assertDatabase() {
    if (!DatabaseService.isInitialized()) {
      throw ErrorService.create(
        ErrorService.CODES.DATABASE_NOT_INITIALIZED,
        'The financial database has not been initialized. Run database initialization first.',
        null,
        ErrorService.CATEGORY_CONFIGURATION
      );
    }
  }

  function invalidateCache() {
    try {
      CacheService.getScriptCache().remove(CACHE_KEY);
    } catch (ignored) {
      /* cache failures are never fatal */
    }
  }

  /**
   * Seeds default categories when the sheet is empty.
   * Safe to run on every initialization.
   */
  function seedDefaults(actor) {
    var existing = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    if (existing.length > 0) {
      return { seeded: 0, total: existing.length };
    }
    var now = DateService.nowIso();
    var rows = [];
    for (var i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      var def = DEFAULT_CATEGORIES[i];
      rows.push({
        category_id: IdService.generateId('CAT'),
        category_name: def.name,
        category_type: def.type,
        parent_category_id: '',
        is_system: def.system,
        is_active: true,
        description: 'System default category.',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
    }
    RepositoryService.batchAppend(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, rows);
    invalidateCache();
    return { seeded: rows.length, total: rows.length };
  }

  /**
   * Adds any missing SYSTEM default categories. Safe to run on every
   * initialization for databases seeded before a category was added.
   */
  function ensureSystemCategories(actor) {
    var existing = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    var byName = {};
    for (var i = 0; i < existing.length; i++) {
      byName[String(existing[i].category_name).toLowerCase()] = true;
    }
    var now = DateService.nowIso();
    var added = 0;
    var rows = [];
    for (var d = 0; d < DEFAULT_CATEGORIES.length; d++) {
      var def = DEFAULT_CATEGORIES[d];
      if (!def.system) {
        continue;
      }
      if (byName[String(def.name).toLowerCase()]) {
        continue;
      }
      rows.push({
        category_id: IdService.generateId('CAT'),
        category_name: def.name,
        category_type: def.type,
        parent_category_id: '',
        is_system: true,
        is_active: true,
        description: 'System default category.',
        created_at: now,
        created_by: actor.userId,
        updated_at: now,
        updated_by: actor.userId
      });
      byName[String(def.name).toLowerCase()] = true;
      added++;
    }
    if (rows.length > 0) {
      RepositoryService.batchAppend(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, rows);
      invalidateCache();
    }
    return added;
  }

  function listCategories() {
    assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    return records.map(function (r) {
      return RepositoryService.toPublicRecord(r);
    });
  }

  /**
   * Returns active categories, optionally filtered by type.
   * Uses a short-lived cache for read-heavy paths.
   */
  function getActiveCategories(type) {
    assertDatabase();
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (String(r.is_active) !== 'FALSE' && r.is_active !== false) {
        if (!type || r.category_type === type) {
          out.push(RepositoryService.toPublicRecord(r));
        }
      }
    }
    return out;
  }

  function getCategoryById(categoryId) {
    var record = RepositoryService.findById(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, categoryId);
    return record ? RepositoryService.toPublicRecord(record) : null;
  }

  function getCategoryRecord(categoryId) {
    return RepositoryService.findById(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, categoryId);
  }

  /**
   * Finds a category by exact name and returns its public (camelCase)
   * record, or null when no active category matches.
   */
  function getCategoryByName(name) {
    var records = RepositoryService.readAll(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES);
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].category_name) === String(name)) {
        return RepositoryService.toPublicRecord(records[i]);
      }
    }
    return null;
  }

  /**
   * Requires a category to exist and be active. Throws otherwise.
   */
  function requireActiveCategory(categoryId) {
    var record = getCategoryRecord(categoryId);
    if (!record) {
      throw ErrorService.create(
        ErrorService.CODES.CATEGORY_NOT_FOUND,
        'The selected financial category does not exist.',
        null,
        ErrorService.CATEGORY_NOT_FOUND
      );
    }
    var inactive = String(record.is_active) === 'FALSE' || record.is_active === false;
    if (inactive) {
      throw ErrorService.create(
        ErrorService.CODES.CATEGORY_INACTIVE,
        'The selected financial category is inactive.',
        null,
        ErrorService.CATEGORY_CONFLICT
      );
    }
    return record;
  }

  function createCategory(payload) {
    assertDatabase();
    var name = ValidationService.trimSafe(payload.categoryName);
    var type = payload.categoryType;
    var nameCheck = ValidationService.isNonEmptyString(name, 'Category name', 100);
    if (!nameCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var typeCheck = ValidationService.isEnum(type, SPRINT_1_TYPES, 'Category type');
    if (!typeCheck.valid) {
      throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, typeCheck.message, null, ErrorService.CATEGORY_VALIDATION);
    }
    var dup = RepositoryService.findByField(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, 'category_name', name);
    for (var i = 0; i < dup.length; i++) {
      if (String(dup[i].is_active) !== 'FALSE' && dup[i].is_active !== false) {
        throw ErrorService.create(
          ErrorService.CODES.VALIDATION_ERROR,
          'A category with this name already exists.',
          null,
          ErrorService.CATEGORY_VALIDATION
        );
      }
    }
    var actor = AuditService.getActor();
    var now = DateService.nowIso();
    var category = {
      category_id: IdService.generateId('CAT'),
      category_name: name,
      category_type: type,
      parent_category_id: payload.parentCategoryId || '',
      is_system: false,
      is_active: true,
      description: payload.description || '',
      created_at: now,
      created_by: actor.userId,
      updated_at: now,
      updated_by: actor.userId
    };
    RepositoryService.appendRecord(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, category);
    invalidateCache();
    AuditService.info(AuditService.ACTIONS.CATEGORY_CREATED, 'FinancialCategories', category.category_id,
      'Created category "' + name + '" (' + type + ').');
    return RepositoryService.toPublicRecord(category);
  }

  function updateCategory(payload) {
    assertDatabase();
    var categoryId = payload.categoryId;
    var record = getCategoryRecord(categoryId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.CATEGORY_NOT_FOUND, 'The financial category was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    var patch = {};
    var actor = AuditService.getActor();
    var changed = [];
    if (payload.categoryName !== undefined) {
      var name = ValidationService.trimSafe(payload.categoryName);
      var nameCheck = ValidationService.isNonEmptyString(name, 'Category name', 100);
      if (!nameCheck.valid) {
        throw ErrorService.create(ErrorService.CODES.VALIDATION_ERROR, nameCheck.message, null, ErrorService.CATEGORY_VALIDATION);
      }
      patch.category_name = name;
      changed.push('name');
    }
    if (payload.description !== undefined) {
      patch.description = payload.description || '';
      changed.push('description');
    }
    if (Object.keys(patch).length === 0) {
      return RepositoryService.toPublicRecord(record);
    }
    patch.updated_at = DateService.nowIso();
    patch.updated_by = actor.userId;
    RepositoryService.updateById(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, categoryId, patch);
    invalidateCache();
    AuditService.info(AuditService.ACTIONS.CATEGORY_UPDATED, 'FinancialCategories', categoryId,
      'Updated category fields: ' + changed.join(', ') + '.');
    return getCategoryById(categoryId);
  }

  function deactivateCategory(categoryId) {
    assertDatabase();
    var record = getCategoryRecord(categoryId);
    if (!record) {
      throw ErrorService.create(ErrorService.CODES.CATEGORY_NOT_FOUND, 'The financial category was not found.', null, ErrorService.CATEGORY_NOT_FOUND);
    }
    if (record.is_system === true || String(record.is_system) === 'TRUE') {
      throw ErrorService.create(
        ErrorService.CODES.VALIDATION_ERROR,
        'System categories cannot be deactivated.',
        null,
        ErrorService.CATEGORY_VALIDATION
      );
    }
    var actor = AuditService.getActor();
    RepositoryService.updateById(SheetSchemaService.SHEET_FINANCIAL_CATEGORIES, categoryId, {
      is_active: false,
      updated_at: DateService.nowIso(),
      updated_by: actor.userId
    });
    invalidateCache();
    AuditService.info(AuditService.ACTIONS.CATEGORY_DEACTIVATED, 'FinancialCategories', categoryId,
      'Deactivated category "' + record.category_name + '".');
    return getCategoryById(categoryId);
  }

  return {
    seedDefaults: seedDefaults,
    ensureSystemCategories: ensureSystemCategories,
    listCategories: listCategories,
    getActiveCategories: getActiveCategories,
    getCategoryById: getCategoryById,
    getCategoryRecord: getCategoryRecord,
    getCategoryByName: getCategoryByName,
    requireActiveCategory: requireActiveCategory,
    createCategory: createCategory,
    updateCategory: updateCategory,
    deactivateCategory: deactivateCategory,
    TYPES: TYPES.slice(0),
    SPRINT_1_TYPES: SPRINT_1_TYPES.slice(0),
    TYPE_INCOME: TYPE_INCOME,
    TYPE_OPERATING_EXPENSE: TYPE_OPERATING_EXPENSE,
    TYPE_CAPITAL_EXPENSE: TYPE_CAPITAL_EXPENSE,
    TYPE_OWNER_CAPITAL: TYPE_OWNER_CAPITAL,
    TYPE_OWNER_WITHDRAWAL: TYPE_OWNER_WITHDRAWAL,
    TYPE_TRANSFER: TYPE_TRANSFER,
    TYPE_ADJUSTMENT: TYPE_ADJUSTMENT
  };
})();
