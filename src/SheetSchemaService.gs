/**
 * SheetSchemaService.gs
 * Canonical Sprint 1 sheet definitions: names, headers, key columns,
 * number/date formats, and column indexes (resolved from headers).
 *
 * Headers are the contract (per docs/DATABASE_SCHEMA.md). Column indexes
 * are always derived from the header map at runtime - never hardcoded
 * positions in service code.
 */

var SheetSchemaService = (function () {
  'use strict';

  var SCHEMA_VERSION = '7.0.0';

  var SHEET_SYSTEM_METADATA = 'SystemMetadata';
  var SHEET_CASH_ACCOUNTS = 'CashAccounts';
  var SHEET_FINANCIAL_CATEGORIES = 'FinancialCategories';
  var SHEET_CASH_TRANSACTIONS = 'CashTransactions';
  var SHEET_DAILY_RECONCILIATIONS = 'DailyCashReconciliations';
  var SHEET_AUDIT_LOGS = 'AuditLogs';

  var SHEET_CLIENTS = 'Clients';
  var SHEET_LEADS = 'Leads';
  var SHEET_CLIENT_NOTES = 'ClientNotes';
  var SHEET_CLIENT_INTERACTIONS = 'ClientInteractions';
  var SHEET_PACKAGES = 'Packages';
  var SHEET_PACKAGE_ITEMS = 'PackageItems';
  var SHEET_PACKAGE_ADD_ONS = 'PackageAddOns';

  var SPRINT_1_SHEETS = [
    SHEET_SYSTEM_METADATA,
    SHEET_CASH_ACCOUNTS,
    SHEET_FINANCIAL_CATEGORIES,
    SHEET_CASH_TRANSACTIONS,
    SHEET_DAILY_RECONCILIATIONS,
    SHEET_AUDIT_LOGS
  ];

  var SPRINT_2_SHEETS = [
    SHEET_CLIENTS,
    SHEET_LEADS,
    SHEET_CLIENT_NOTES,
    SHEET_CLIENT_INTERACTIONS,
    SHEET_PACKAGES,
    SHEET_PACKAGE_ITEMS,
    SHEET_PACKAGE_ADD_ONS
  ];

  var SHEET_BOOKINGS = 'Bookings';
  var SHEET_BOOKING_ITEMS = 'BookingItems';
  var SHEET_BOOKING_STATUS_HISTORY = 'BookingStatusHistory';
  var SHEET_BOOKING_SCHEDULE_HISTORY = 'BookingScheduleHistory';
  var SHEET_PAYMENTS = 'Payments';
  var SHEET_PAYMENT_ALLOCATIONS = 'PaymentAllocations';
  var SHEET_REFUNDS = 'Refunds';

  var SPRINT_3_SHEETS = [
    SHEET_BOOKINGS,
    SHEET_BOOKING_ITEMS,
    SHEET_BOOKING_STATUS_HISTORY,
    SHEET_BOOKING_SCHEDULE_HISTORY,
    SHEET_PAYMENTS,
    SHEET_PAYMENT_ALLOCATIONS,
    SHEET_REFUNDS
  ];

  var SHEET_EXPENSES = 'Expenses';
  var SHEET_BOOKING_COSTS = 'BookingCosts';

  var SPRINT_4_SHEETS = [
    SHEET_EXPENSES,
    SHEET_BOOKING_COSTS
  ];

  var SHEET_INVENTORY_ITEMS = 'InventoryItems';
  var SHEET_INVENTORY_BATCHES = 'InventoryBatches';
  var SHEET_INVENTORY_MOVEMENTS = 'InventoryMovements';
  var SHEET_SUPPLIERS = 'Suppliers';
  var SHEET_PURCHASES = 'Purchases';
  var SHEET_PURCHASE_ITEMS = 'PurchaseItems';
  var SHEET_EQUIPMENT = 'Equipment';
  var SHEET_EQUIPMENT_MOVEMENTS = 'EquipmentMovements';

  var SPRINT_5_SHEETS = [
    SHEET_INVENTORY_ITEMS,
    SHEET_INVENTORY_BATCHES,
    SHEET_INVENTORY_MOVEMENTS,
    SHEET_SUPPLIERS,
    SHEET_PURCHASES,
    SHEET_PURCHASE_ITEMS,
    SHEET_EQUIPMENT,
    SHEET_EQUIPMENT_MOVEMENTS
  ];

  var SHEET_TASKS = 'Tasks';
  var SHEET_EVENT_DEPLOYMENTS = 'EventDeployments';
  var SHEET_DEPLOYMENT_ITEMS = 'DeploymentItems';
  var SHEET_DEPLOYMENT_EQUIPMENT = 'DeploymentEquipment';
  var SHEET_DEPLOYMENT_CHECKLISTS = 'DeploymentChecklists';
  var SHEET_DEPLOYMENT_INCIDENTS = 'DeploymentIncidents';
  var SHEET_CREW = 'Crew';
  var SHEET_CREW_ASSIGNMENTS = 'CrewAssignments';
  var SHEET_CREW_PAYMENTS = 'CrewPayments';
  var SHEET_PARTNERS = 'Partners';
  var SHEET_PARTNER_COMMISSIONS = 'PartnerCommissions';

  var SPRINT_6_SHEETS = [
    SHEET_TASKS,
    SHEET_EVENT_DEPLOYMENTS,
    SHEET_DEPLOYMENT_ITEMS,
    SHEET_DEPLOYMENT_EQUIPMENT,
    SHEET_DEPLOYMENT_CHECKLISTS,
    SHEET_DEPLOYMENT_INCIDENTS,
    SHEET_CREW,
    SHEET_CREW_ASSIGNMENTS,
    SHEET_CREW_PAYMENTS,
    SHEET_PARTNERS,
    SHEET_PARTNER_COMMISSIONS
  ];

  var SHEET_FILES = 'Files';
  var SHEET_SYNC_LOGS = 'SyncLogs';

  var SPRINT_8_SHEETS = [
    SHEET_FILES,
    SHEET_SYNC_LOGS
  ];

  var APPROVED_SHEETS = SPRINT_1_SHEETS
    .concat(SPRINT_2_SHEETS)
    .concat(SPRINT_3_SHEETS)
    .concat(SPRINT_4_SHEETS)
    .concat(SPRINT_5_SHEETS)
    .concat(SPRINT_6_SHEETS)
    .concat(SPRINT_8_SHEETS);

  var SCHEMAS = {};

  SCHEMAS[SHEET_SYSTEM_METADATA] = {
    headers: ['metadata_key', 'metadata_value', 'description', 'updated_at', 'updated_by'],
    idField: 'metadata_key',
    dateFormats: {},
    numberFormats: {}
  };

  SCHEMAS[SHEET_CASH_ACCOUNTS] = {
    headers: [
      'account_id', 'account_name', 'account_type', 'institution_name',
      'account_reference', 'opening_balance', 'opening_balance_date',
      'current_balance_cached', 'is_active', 'notes', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'account_id',
    dateFormats: { opening_balance_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { opening_balance: '#,##0.00', current_balance_cached: '#,##0.00' }
  };

  SCHEMAS[SHEET_FINANCIAL_CATEGORIES] = {
    headers: [
      'category_id', 'category_name', 'category_type', 'parent_category_id',
      'is_system', 'is_active', 'description', 'created_at', 'created_by',
      'updated_at', 'updated_by'
    ],
    idField: 'category_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_CASH_TRANSACTIONS] = {
    headers: [
      'transaction_id', 'transaction_date', 'transaction_datetime',
      'transaction_type', 'category_id', 'account_id', 'counterparty', 'amount',
      'direction', 'description', 'reference_number', 'source_type', 'source_id',
      'transfer_group_id', 'status', 'voided_at', 'voided_by', 'void_reason',
      'correction_of_transaction_id', 'idempotency_key', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'transaction_id',
    dateFormats: { transaction_date: 'yyyy-mm-dd', transaction_datetime: 'yyyy-mm-dd hh:mm', voided_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_DAILY_RECONCILIATIONS] = {
    headers: [
      'reconciliation_id', 'reconciliation_date', 'account_id', 'opening_expected',
      'inflows', 'outflows', 'transfers_in', 'transfers_out', 'expected_closing',
      'actual_closing', 'difference', 'explanation', 'status', 'reconciled_at',
      'reconciled_by', 'created_at', 'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'reconciliation_id',
    dateFormats: { reconciliation_date: 'yyyy-mm-dd', reconciled_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { opening_expected: '#,##0.00', inflows: '#,##0.00', outflows: '#,##0.00', transfers_in: '#,##0.00', transfers_out: '#,##0.00', expected_closing: '#,##0.00', actual_closing: '#,##0.00', difference: '#,##0.00' }
  };

  SCHEMAS[SHEET_AUDIT_LOGS] = {
    headers: [
      'audit_id', 'timestamp', 'actor_id', 'actor_name', 'action', 'entity_type',
      'entity_id', 'summary', 'before_data', 'after_data', 'metadata', 'severity',
      'request_id'
    ],
    idField: 'audit_id',
    dateFormats: { timestamp: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  /* ------------------- Sprint 2: customers & packages ------------------- */

  SCHEMAS[SHEET_CLIENTS] = {
    headers: [
      'client_id', 'client_code', 'full_name', 'first_name', 'last_name',
      'business_or_organization', 'contact_number', 'alternate_contact_number',
      'email', 'facebook_profile_url', 'instagram_profile_url', 'address_line',
      'city_municipality', 'province', 'preferred_contact_channel', 'client_type',
      'client_status', 'source_channel', 'notes_summary', 'total_bookings_cached',
      'total_revenue_cached', 'outstanding_balance_cached', 'last_booking_date',
      'last_contacted_at', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'client_id',
    dateFormats: { last_booking_date: 'yyyy-mm-dd', last_contacted_at: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { total_revenue_cached: '#,##0.00', outstanding_balance_cached: '#,##0.00' }
  };

  SCHEMAS[SHEET_CLIENT_NOTES] = {
    headers: [
      'note_id', 'client_id', 'note_type', 'note_text', 'is_pinned', 'visibility',
      'created_at', 'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'note_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_CLIENT_INTERACTIONS] = {
    headers: [
      'interaction_id', 'client_id', 'lead_id', 'interaction_date', 'interaction_type',
      'channel', 'subject', 'summary', 'outcome', 'next_follow_up_date', 'created_at',
      'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'interaction_id',
    dateFormats: { interaction_date: 'yyyy-mm-dd', next_follow_up_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_LEADS] = {
    headers: [
      'lead_id', 'lead_code', 'lead_name', 'business_or_organization', 'contact_number',
      'email', 'facebook_profile_url', 'instagram_profile_url', 'event_type',
      'event_date_interest', 'venue_or_location', 'service_interest', 'estimated_budget',
      'source_channel', 'referred_by', 'lead_status', 'priority', 'assigned_to',
      'last_contacted_at', 'next_follow_up_date', 'lost_reason', 'converted_client_id',
      'converted_at', 'notes_summary', 'created_at', 'created_by', 'updated_at',
      'updated_by', 'version'
    ],
    idField: 'lead_id',
    dateFormats: { event_date_interest: 'yyyy-mm-dd', last_contacted_at: 'yyyy-mm-dd', next_follow_up_date: 'yyyy-mm-dd', converted_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { estimated_budget: '#,##0.00' }
  };

  SCHEMAS[SHEET_PACKAGES] = {
    headers: [
      'package_id', 'package_code', 'package_name', 'service_type', 'description',
      'base_price', 'duration_hours', 'expected_direct_cost', 'expected_gross_profit',
      'expected_profit_margin', 'extra_hour_rate', 'minimum_booking_amount',
      'cost_calculation_method', 'is_customizable', 'is_featured', 'is_active',
      'display_order', 'terms_summary', 'created_at', 'created_by', 'updated_at',
      'updated_by', 'version'
    ],
    idField: 'package_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { base_price: '#,##0.00', expected_direct_cost: '#,##0.00', expected_gross_profit: '#,##0.00', expected_profit_margin: '0.00"%"', extra_hour_rate: '#,##0.00', minimum_booking_amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_PACKAGE_ITEMS] = {
    headers: [
      'package_item_id', 'package_id', 'item_name', 'item_type', 'description',
      'quantity', 'unit', 'estimated_unit_cost', 'estimated_total_cost',
      'is_optional', 'is_visible_to_client', 'display_order', 'created_at',
      'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'package_item_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { quantity: '#,##0', estimated_unit_cost: '#,##0.00', estimated_total_cost: '#,##0.00' }
  };

  SCHEMAS[SHEET_PACKAGE_ADD_ONS] = {
    headers: [
      'add_on_id', 'add_on_code', 'add_on_name', 'service_type', 'description',
      'selling_price', 'estimated_direct_cost', 'expected_gross_profit',
      'expected_profit_margin', 'unit', 'is_active', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'add_on_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { selling_price: '#,##0.00', estimated_direct_cost: '#,##0.00', expected_gross_profit: '#,##0.00', expected_profit_margin: '0.00"%"' }
  };

  /* ------------------- Sprint 3: bookings & payments ------------------- */

  SCHEMAS[SHEET_BOOKINGS] = {
    headers: [
      'booking_id', 'booking_code', 'client_id', 'lead_id', 'booking_title',
      'service_type', 'event_type', 'event_date', 'event_start_time',
      'event_end_time', 'setup_time', 'venue_name', 'venue_address',
      'city_municipality', 'province', 'venue_contact_name', 'venue_contact_number',
      'package_id', 'package_name_snapshot', 'package_price_snapshot',
      'package_duration_snapshot', 'subtotal', 'add_on_total',
      'custom_charge_total', 'transportation_charge', 'discount_type',
      'discount_value', 'discount_amount', 'gross_booking_amount',
      'planned_partner_commission', 'net_contract_amount', 'estimated_direct_cost',
      'estimated_gross_profit', 'estimated_profit_margin', 'amount_paid_cached',
      'balance_due_cached', 'booking_status', 'payment_status', 'production_status',
      'deployment_status', 'source_channel', 'partner_id', 'assigned_owner',
      'special_instructions', 'internal_notes', 'idempotency_key',
      'cancellation_reason',
      'cancelled_at', 'cancelled_by', 'completed_at', 'financially_closed_at',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'booking_id',
    dateFormats: { event_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm', cancelled_at: 'yyyy-mm-dd hh:mm', completed_at: 'yyyy-mm-dd hh:mm', financially_closed_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { subtotal: '#,##0.00', add_on_total: '#,##0.00', custom_charge_total: '#,##0.00', transportation_charge: '#,##0.00', discount_amount: '#,##0.00', gross_booking_amount: '#,##0.00', planned_partner_commission: '#,##0.00', net_contract_amount: '#,##0.00', estimated_direct_cost: '#,##0.00', estimated_gross_profit: '#,##0.00', estimated_profit_margin: '0.00"%"', amount_paid_cached: '#,##0.00', balance_due_cached: '#,##0.00' }
  };

  SCHEMAS[SHEET_BOOKING_ITEMS] = {
    headers: [
      'booking_item_id', 'booking_id', 'source_type', 'source_id', 'item_name',
      'description', 'quantity', 'unit', 'unit_price', 'line_total',
      'estimated_unit_cost', 'estimated_total_cost', 'is_taxable',
      'is_discountable', 'display_order', 'created_at', 'created_by',
      'updated_at', 'updated_by'
    ],
    idField: 'booking_item_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { quantity: '#,##0', unit_price: '#,##0.00', line_total: '#,##0.00', estimated_unit_cost: '#,##0.00', estimated_total_cost: '#,##0.00' }
  };

  SCHEMAS[SHEET_BOOKING_STATUS_HISTORY] = {
    headers: [
      'status_history_id', 'booking_id', 'previous_status', 'new_status', 'reason',
      'changed_at', 'changed_by'
    ],
    idField: 'status_history_id',
    dateFormats: { changed_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_BOOKING_SCHEDULE_HISTORY] = {
    headers: [
      'schedule_history_id', 'booking_id', 'previous_event_date',
      'previous_start_time', 'previous_end_time', 'new_event_date',
      'new_start_time', 'new_end_time', 'reason', 'changed_at', 'changed_by'
    ],
    idField: 'schedule_history_id',
    dateFormats: { previous_event_date: 'yyyy-mm-dd', new_event_date: 'yyyy-mm-dd', changed_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_PAYMENTS] = {
    headers: [
      'payment_id', 'payment_code', 'client_id', 'booking_id', 'payment_date',
      'payment_datetime', 'payment_type', 'payment_method', 'cash_account_id',
      'amount', 'reference_number', 'payer_name', 'notes', 'status',
      'cash_transaction_id', 'idempotency_key', 'voided_at', 'voided_by',
      'void_reason', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'payment_id',
    dateFormats: { payment_date: 'yyyy-mm-dd', payment_datetime: 'yyyy-mm-dd hh:mm', voided_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_PAYMENT_ALLOCATIONS] = {
    headers: [
      'allocation_id', 'payment_id', 'booking_id', 'allocated_amount',
      'allocation_date', 'created_at', 'created_by'
    ],
    idField: 'allocation_id',
    dateFormats: { allocation_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { allocated_amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_REFUNDS] = {
    headers: [
      'refund_id', 'refund_code', 'payment_id', 'booking_id', 'client_id',
      'refund_date', 'amount', 'cash_account_id', 'reason', 'status',
      'cash_transaction_id', 'idempotency_key', 'created_at', 'created_by',
      'voided_at', 'voided_by', 'void_reason'
    ],
    idField: 'refund_id',
    dateFormats: { refund_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', voided_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { amount: '#,##0.00' }
  };

  /* ------------------- Sprint 4: expenses & profitability ------------------- */

  SCHEMAS[SHEET_EXPENSES] = {
    headers: [
      'expense_id', 'expense_code', 'expense_date', 'category_id', 'description',
      'gross_amount', 'tax_amount', 'net_amount', 'supplier_name', 'booking_id',
      'cost_type', 'approval_status', 'submitted_at', 'approved_by',
      'approved_at', 'rejected_reason', 'paid_from_account_id', 'paid_at',
      'payment_method', 'receipt_file_id', 'cash_transaction_id',
      'idempotency_key', 'voided_at', 'voided_by', 'void_reason',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'expense_id',
    dateFormats: { expense_date: 'yyyy-mm-dd', submitted_at: 'yyyy-mm-dd hh:mm', approved_at: 'yyyy-mm-dd hh:mm', paid_at: 'yyyy-mm-dd hh:mm', voided_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { gross_amount: '#,##0.00', tax_amount: '#,##0.00', net_amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_BOOKING_COSTS] = {
    headers: [
      'booking_cost_id', 'booking_id', 'revenue_subtotal', 'discount_amount',
      'tax_amount', 'revenue_total', 'cost_material', 'cost_transport',
      'cost_meals', 'cost_crew', 'cost_commission', 'cost_other_direct',
      'direct_cost_total', 'gross_profit', 'alloc_ops_cost', 'net_profit',
      'profit_margin_pct', 'recalculated_at', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'booking_cost_id',
    dateFormats: { recalculated_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { revenue_subtotal: '#,##0.00', discount_amount: '#,##0.00', tax_amount: '#,##0.00', revenue_total: '#,##0.00', cost_material: '#,##0.00', cost_transport: '#,##0.00', cost_meals: '#,##0.00', cost_crew: '#,##0.00', cost_commission: '#,##0.00', cost_other_direct: '#,##0.00', direct_cost_total: '#,##0.00', gross_profit: '#,##0.00', alloc_ops_cost: '#,##0.00', net_profit: '#,##0.00', profit_margin_pct: '0.00"%"' }
  };

  /* ------------------- Sprint 5: inventory & equipment ------------------- */

  SCHEMAS[SHEET_INVENTORY_ITEMS] = {
    headers: [
      'item_id', 'sku', 'name', 'category', 'unit', 'reorder_level',
      'cost_method', 'storage_location', 'is_active', 'notes', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'item_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { reorder_level: '#,##0.00' }
  };

  SCHEMAS[SHEET_INVENTORY_BATCHES] = {
    headers: [
      'batch_id', 'item_id', 'purchase_item_id', 'received_at', 'qty_in',
      'remaining_qty', 'unit_cost', 'landing_cost', 'batch_cost',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'batch_id',
    dateFormats: { received_at: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { qty_in: '#,##0.00', remaining_qty: '#,##0.00', unit_cost: '#,##0.00', landing_cost: '#,##0.00', batch_cost: '#,##0.00' }
  };

  SCHEMAS[SHEET_INVENTORY_MOVEMENTS] = {
    headers: [
      'movement_id', 'item_id', 'batch_id', 'movement_type', 'quantity',
      'source', 'source_ref_id', 'unit_cost', 'value', 'reason', 'created_by',
      'created_at', 'updated_at', 'updated_by'
    ],
    idField: 'movement_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { quantity: '#,##0.00', unit_cost: '#,##0.00', value: '#,##0.00' }
  };

  SCHEMAS[SHEET_SUPPLIERS] = {
    headers: [
      'supplier_id', 'name', 'contact_person', 'phone', 'email', 'address',
      'payment_terms_days', 'is_active', 'notes', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'supplier_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { payment_terms_days: '#,##0' }
  };

  SCHEMAS[SHEET_PURCHASES] = {
    headers: [
      'purchase_id', 'supplier_id', 'purchase_date', 'expected_date', 'status',
      'shipping_cost', 'total', 'notes', 'idempotency_key', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'purchase_id',
    dateFormats: { purchase_date: 'yyyy-mm-dd', expected_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { shipping_cost: '#,##0.00', total: '#,##0.00' }
  };

  SCHEMAS[SHEET_PURCHASE_ITEMS] = {
    headers: [
      'purchase_item_id', 'purchase_id', 'inventory_item_id', 'item_name',
      'equipment_name', 'quantity', 'unit_cost', 'line_total', 'received_qty',
      'batch_id', 'created_at', 'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'purchase_item_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { quantity: '#,##0.00', unit_cost: '#,##0.00', line_total: '#,##0.00', received_qty: '#,##0.00' }
  };

  SCHEMAS[SHEET_EQUIPMENT] = {
    headers: [
      'equipment_id', 'name', 'category', 'serial_number', 'purchase_date',
      'purchase_price', 'useful_life_months', 'condition', 'status', 'notes',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'equipment_id',
    dateFormats: { purchase_date: 'yyyy-mm-dd', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { purchase_price: '#,##0.00', useful_life_months: '#,##0' }
  };

  SCHEMAS[SHEET_EQUIPMENT_MOVEMENTS] = {
    headers: [
      'equipment_movement_id', 'equipment_id', 'deployment_id', 'movement_type',
      'condition_out', 'condition_in', 'notes', 'cost', 'performed_at',
      'performed_by', 'created_at', 'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'equipment_movement_id',
    dateFormats: { performed_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { cost: '#,##0.00' }
  };

  /* ------------------- Sprint 6: production, deployments, crew, partners ------------------- */

  SCHEMAS[SHEET_TASKS] = {
    headers: [
      'task_id', 'booking_id', 'task_type', 'title', 'description', 'is_required',
      'assignee_id', 'due_date', 'status', 'done_at', 'done_by', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'task_id',
    dateFormats: { due_date: 'yyyy-mm-dd', done_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_EVENT_DEPLOYMENTS] = {
    headers: [
      'deployment_id', 'booking_id', 'status', 'scheduled_date', 'actual_material_cost',
      'actual_booking_cost', 'started_at', 'started_by', 'returned_at', 'returned_by',
      'reconciled_at', 'reconciled_by', 'closed_at', 'closed_by', 'checklist_source',
      'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'deployment_id',
    dateFormats: { scheduled_date: 'yyyy-mm-dd', started_at: 'yyyy-mm-dd hh:mm', returned_at: 'yyyy-mm-dd hh:mm', reconciled_at: 'yyyy-mm-dd hh:mm', closed_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { actual_material_cost: '#,##0.00', actual_booking_cost: '#,##0.00' }
  };

  SCHEMAS[SHEET_DEPLOYMENT_ITEMS] = {
    headers: [
      'deployment_item_id', 'deployment_id', 'item_id', 'item_name', 'projected_qty',
      'loaded_qty', 'returned_qty', 'consumed_qty', 'unit_cost', 'wastage_reason',
      'cost', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'deployment_item_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { projected_qty: '#,##0.00', loaded_qty: '#,##0.00', returned_qty: '#,##0.00', consumed_qty: '#,##0.00', unit_cost: '#,##0.00', cost: '#,##0.00' }
  };

  SCHEMAS[SHEET_DEPLOYMENT_EQUIPMENT] = {
    headers: [
      'deployment_equip_id', 'deployment_id', 'equipment_id', 'condition_out',
      'condition_in', 'notes', 'created_at', 'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'deployment_equip_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_DEPLOYMENT_CHECKLISTS] = {
    headers: [
      'checklist_item_id', 'deployment_id', 'template_id', 'item_name', 'is_required',
      'is_done', 'done_by', 'done_at', 'created_at', 'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'checklist_item_id',
    dateFormats: { done_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_DEPLOYMENT_INCIDENTS] = {
    headers: [
      'incident_id', 'deployment_id', 'severity', 'title', 'description',
      'action_taken', 'reported_by', 'resolved', 'resolved_at', 'created_at',
      'created_by', 'updated_at', 'updated_by'
    ],
    idField: 'incident_id',
    dateFormats: { resolved_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  SCHEMAS[SHEET_CREW] = {
    headers: [
      'crew_member_id', 'name', 'phone', 'email', 'role_tags', 'pay_rate_type',
      'pay_rate', 'is_active', 'notes', 'created_at', 'created_by', 'updated_at',
      'updated_by', 'version'
    ],
    idField: 'crew_member_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { pay_rate: '#,##0.00' }
  };

  SCHEMAS[SHEET_CREW_ASSIGNMENTS] = {
    headers: [
      'crew_assign_id', 'booking_id', 'deployment_id', 'crew_member_id', 'role',
      'pay_rate', 'hours', 'pay_amount', 'signed_off', 'signoff_at', 'signoff_by',
      'pay_status', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'crew_assign_id',
    dateFormats: { signoff_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { pay_rate: '#,##0.00', hours: '#,##0.00', pay_amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_CREW_PAYMENTS] = {
    headers: [
      'crew_payment_id', 'crew_assign_id', 'crew_member_id', 'amount', 'paid_at',
      'method', 'cash_account_id', 'cash_transaction_id', 'idempotency_key',
      'voided_at', 'voided_by', 'void_reason', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'crew_payment_id',
    dateFormats: { paid_at: 'yyyy-mm-dd', voided_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { amount: '#,##0.00' }
  };

  SCHEMAS[SHEET_PARTNERS] = {
    headers: [
      'partner_id', 'name', 'partner_type', 'contact_phone', 'email',
      'commission_rate_pct', 'is_active', 'notes', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'partner_id',
    dateFormats: { created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { commission_rate_pct: '0.00"%"' }
  };

  SCHEMAS[SHEET_PARTNER_COMMISSIONS] = {
    headers: [
      'commission_id', 'booking_id', 'partner_id', 'base_amount', 'rate_pct',
      'commission_amount', 'status', 'cash_transaction_id', 'idempotency_key',
      'settled_at', 'voided_at', 'voided_by', 'void_reason', 'created_at',
      'created_by', 'updated_at', 'updated_by', 'version'
    ],
    idField: 'commission_id',
    dateFormats: { settled_at: 'yyyy-mm-dd hh:mm', voided_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { base_amount: '#,##0.00', rate_pct: '0.00"%"', commission_amount: '#,##0.00' }
  };

  /* ------------------- Sprint 8: files & sync log ------------------- */

  SCHEMAS[SHEET_FILES] = {
    headers: [
      'file_id', 'drive_file_id', 'drive_folder_id', 'filename', 'content_type',
      'entity_type', 'entity_id', 'size_bytes', 'uploaded_by', 'uploaded_at',
      'is_trashed', 'trashed_at', 'trashed_by', 'created_at', 'created_by',
      'updated_at', 'updated_by', 'version'
    ],
    idField: 'file_id',
    dateFormats: { uploaded_at: 'yyyy-mm-dd hh:mm', trashed_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: { size_bytes: '#,##0' }
  };

  SCHEMAS[SHEET_SYNC_LOGS] = {
    headers: [
      'sync_id', 'sync_type', 'entity_type', 'entity_id', 'external_type',
      'external_id', 'status', 'detail', 'error_code', 'retry_count',
      'synced_at', 'created_at', 'updated_at'
    ],
    idField: 'sync_id',
    dateFormats: { synced_at: 'yyyy-mm-dd hh:mm', created_at: 'yyyy-mm-dd hh:mm', updated_at: 'yyyy-mm-dd hh:mm' },
    numberFormats: {}
  };

  /**
   * Returns the canonical header list for a sheet.
   * @param {string} sheetName
   * @return {string[]} Headers or throws SCHEMA configuration error.
   */
  function getHeaders(sheetName) {
    var schema = SCHEMAS[sheetName];
    if (!schema) {
      throw ErrorService.create('SCHEMA_NOT_DEFINED', 'No schema is defined for sheet: ' + sheetName + '.', null, ErrorService.CATEGORY_CONFIGURATION);
    }
    return schema.headers.slice(0);
  }

  /**
   * Returns the immutable-ID column name for a sheet.
   */
  function getIdField(sheetName) {
    var schema = SCHEMAS[sheetName];
    if (!schema) {
      throw ErrorService.create('SCHEMA_NOT_DEFINED', 'No schema is defined for sheet: ' + sheetName + '.', null, ErrorService.CATEGORY_CONFIGURATION);
    }
    return schema.idField;
  }

  function getSchema(sheetName) {
    var schema = SCHEMAS[sheetName];
    if (!schema) {
      throw ErrorService.create('SCHEMA_NOT_DEFINED', 'No schema is defined for sheet: ' + sheetName + '.', null, ErrorService.CATEGORY_CONFIGURATION);
    }
    return {
      headers: schema.headers.slice(0),
      idField: schema.idField,
      dateFormats: schema.dateFormats ? Object.assign({}, schema.dateFormats) : {},
      numberFormats: schema.numberFormats ? Object.assign({}, schema.numberFormats) : {}
    };
  }

  /**
   * Builds a header-to-column-index map (0-based).
   */
  function buildHeaderMap(headers) {
    var map = {};
    for (var i = 0; i < headers.length; i++) {
      map[headers[i]] = i;
    }
    return map;
  }

  function isSprint1Sheet(sheetName) {
    return SPRINT_1_SHEETS.indexOf(sheetName) !== -1;
  }

  function isApprovedSheet(sheetName) {
    return APPROVED_SHEETS.indexOf(sheetName) !== -1;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    SHEET_SYSTEM_METADATA: SHEET_SYSTEM_METADATA,
    SHEET_CASH_ACCOUNTS: SHEET_CASH_ACCOUNTS,
    SHEET_FINANCIAL_CATEGORIES: SHEET_FINANCIAL_CATEGORIES,
    SHEET_CASH_TRANSACTIONS: SHEET_CASH_TRANSACTIONS,
    SHEET_DAILY_RECONCILIATIONS: SHEET_DAILY_RECONCILIATIONS,
    SHEET_AUDIT_LOGS: SHEET_AUDIT_LOGS,
    SHEET_CLIENTS: SHEET_CLIENTS,
    SHEET_LEADS: SHEET_LEADS,
    SHEET_CLIENT_NOTES: SHEET_CLIENT_NOTES,
    SHEET_CLIENT_INTERACTIONS: SHEET_CLIENT_INTERACTIONS,
    SHEET_PACKAGES: SHEET_PACKAGES,
    SHEET_PACKAGE_ITEMS: SHEET_PACKAGE_ITEMS,
    SHEET_PACKAGE_ADD_ONS: SHEET_PACKAGE_ADD_ONS,
    SHEET_BOOKINGS: SHEET_BOOKINGS,
    SHEET_BOOKING_ITEMS: SHEET_BOOKING_ITEMS,
    SHEET_BOOKING_STATUS_HISTORY: SHEET_BOOKING_STATUS_HISTORY,
    SHEET_BOOKING_SCHEDULE_HISTORY: SHEET_BOOKING_SCHEDULE_HISTORY,
SHEET_PAYMENTS: SHEET_PAYMENTS,
    SHEET_PAYMENT_ALLOCATIONS: SHEET_PAYMENT_ALLOCATIONS,
    SHEET_REFUNDS: SHEET_REFUNDS,
    SHEET_EXPENSES: SHEET_EXPENSES,
    SHEET_BOOKING_COSTS: SHEET_BOOKING_COSTS,
    SHEET_INVENTORY_ITEMS: SHEET_INVENTORY_ITEMS,
    SHEET_INVENTORY_BATCHES: SHEET_INVENTORY_BATCHES,
    SHEET_INVENTORY_MOVEMENTS: SHEET_INVENTORY_MOVEMENTS,
    SHEET_SUPPLIERS: SHEET_SUPPLIERS,
    SHEET_PURCHASES: SHEET_PURCHASES,
    SHEET_PURCHASE_ITEMS: SHEET_PURCHASE_ITEMS,
    SHEET_EQUIPMENT: SHEET_EQUIPMENT,
    SHEET_EQUIPMENT_MOVEMENTS: SHEET_EQUIPMENT_MOVEMENTS,
    SHEET_TASKS: SHEET_TASKS,
    SHEET_EVENT_DEPLOYMENTS: SHEET_EVENT_DEPLOYMENTS,
    SHEET_DEPLOYMENT_ITEMS: SHEET_DEPLOYMENT_ITEMS,
    SHEET_DEPLOYMENT_EQUIPMENT: SHEET_DEPLOYMENT_EQUIPMENT,
    SHEET_DEPLOYMENT_CHECKLISTS: SHEET_DEPLOYMENT_CHECKLISTS,
    SHEET_DEPLOYMENT_INCIDENTS: SHEET_DEPLOYMENT_INCIDENTS,
    SHEET_CREW: SHEET_CREW,
    SHEET_CREW_ASSIGNMENTS: SHEET_CREW_ASSIGNMENTS,
    SHEET_CREW_PAYMENTS: SHEET_CREW_PAYMENTS,
    SHEET_PARTNERS: SHEET_PARTNERS,
    SHEET_PARTNER_COMMISSIONS: SHEET_PARTNER_COMMISSIONS,
    SHEET_FILES: SHEET_FILES,
    SHEET_SYNC_LOGS: SHEET_SYNC_LOGS,
    SPRINT_1_SHEETS: SPRINT_1_SHEETS.slice(0),
    SPRINT_2_SHEETS: SPRINT_2_SHEETS.slice(0),
    SPRINT_3_SHEETS: SPRINT_3_SHEETS.slice(0),
    SPRINT_4_SHEETS: SPRINT_4_SHEETS.slice(0),
    SPRINT_5_SHEETS: SPRINT_5_SHEETS.slice(0),
SPRINT_6_SHEETS: SPRINT_6_SHEETS.slice(0),
    SPRINT_8_SHEETS: SPRINT_8_SHEETS.slice(0),
    APPROVED_SHEETS: APPROVED_SHEETS.slice(0),
    getHeaders: getHeaders,
    getIdField: getIdField,
    getSchema: getSchema,
    buildHeaderMap: buildHeaderMap,
    isSprint1Sheet: isSprint1Sheet
  };
})();

