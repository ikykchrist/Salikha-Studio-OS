/**
 * ErrorService.gs
 * Central error handling for Salikha Studio OS.
 *
 * Provides stable error codes, safe normalization, and user-friendly
 * messages. Internal stack traces are logged, never returned to the
 * browser. Business-specific error codes are added in future sprints.
 */

var ErrorService = (function () {
  'use strict';

  var CATEGORY_VALIDATION = 'validation';
  var CATEGORY_CONFIGURATION = 'configuration';
  var CATEGORY_NOT_FOUND = 'not_found';
  var CATEGORY_PERMISSION = 'permission';
  var CATEGORY_CONFLICT = 'conflict';
  var CATEGORY_INTERNAL = 'internal';
  /**
   * Creates a normalized application error object.
   */
  function create(code, message, details, category) {
    var err = new Error(message);
    err.code = code || 'INTERNAL_ERROR';
    err.category = category || CATEGORY_INTERNAL;
    err.details = details !== undefined ? details : null;
    err.isAppError = true;
    return err;
  }

  /**
   * Converts any thrown value into a normalized app error.
   * Preserves the original code when one exists.
   */
  function normalize(err) {
    if (err && err.isAppError) {
      return err;
    }
    if (err instanceof Error) {
      var code = err.code || 'INTERNAL_ERROR';
      var category = err.category || CATEGORY_INTERNAL;
      return create(code, err.message || 'An unexpected error occurred.', null, category);
    }
    return create('INTERNAL_ERROR', 'An unexpected error occurred.', err, CATEGORY_INTERNAL);
  }

  /**
   * User-facing message for a given error code.
   * Falls back to the error message when the code is unknown.
   */
  function toUserMessage(err) {
    if (!err) {
      return 'An unexpected error occurred.';
    }
    var safe = normalize(err);
    var map = {
      VALIDATION_ERROR: 'Please check the entered values and try again.',
      CONFIGURATION_ERROR: 'The system is not fully configured. Please contact the owner.',
      NOT_FOUND: 'The requested record was not found.',
      PERMISSION_DENIED: 'You do not have permission to perform this action.',
      CONFLICT: 'This operation conflicts with the current state. Please refresh and retry.',
      INTERNAL_ERROR: 'Something went wrong. Please try again or contact the owner.',
      DATABASE_NOT_CONFIGURED: 'The business database is not configured. Add SPREADSHEET_ID in Apps Script Script Properties.',
      DRIVE_NOT_CONFIGURED: 'The root Drive folder is not configured. Add ROOT_DRIVE_FOLDER_ID in Apps Script Script Properties.',
      AUTHORIZATION_REQUIRED: 'Sign in with your Google account to continue.',
      USER_NOT_REGISTERED: 'This Google account is not registered for Salikha Studio OS.',
      SETUP_PERMISSION_DENIED: 'Only the system owner or an authorized setup role can initialize the system.',
      AUTOMATION_SETUP_FAILED: 'The automation triggers could not be created. Please try again or contact the owner.',
      SYSTEM_HEALTH_FAILED: 'The system health check failed. Review the setup steps and contact the owner if it persists.',
      DATABASE_INITIALIZATION_FAILED: 'The business database schema could not be initialized.',
      DATABASE_NOT_INITIALIZED: 'The financial database has not been initialized yet.',
      SHEET_NOT_FOUND: 'A required spreadsheet sheet is missing.',
      SCHEMA_MISMATCH: 'A spreadsheet sheet does not match the approved schema.',
      ACCOUNT_NOT_FOUND: 'The cash account was not found.',
      ACCOUNT_INACTIVE: 'The cash account is inactive.',
      CATEGORY_NOT_FOUND: 'The financial category was not found.',
      CATEGORY_INACTIVE: 'The financial category is inactive.',
      INVALID_TRANSACTION_TYPE: 'The transaction type is not valid.',
      INVALID_AMOUNT: 'The amount is not valid.',
      INSUFFICIENT_FUNDS: 'There is not enough cash in the selected account.',
      DUPLICATE_TRANSACTION: 'This transaction was already recorded.',
      TRANSFER_ACCOUNT_CONFLICT: 'Source and destination accounts must be different.',
      TRANSACTION_ALREADY_VOIDED: 'This transaction is already voided.',
      TRANSFER_INTEGRITY_ERROR: 'A transfer integrity problem was detected. The ledger was not changed.',
      RECONCILIATION_ALREADY_EXISTS: 'A finalized reconciliation already exists for this account and date.',
      LOCK_TIMEOUT: 'The system is busy. Please try again in a moment.',
      SPREADSHEET_NOT_CONFIGURED: 'The business database is not configured. Add SPREADSHEET_ID in Apps Script Script Properties.',
      SPREADSHEET_ACCESS_DENIED: 'The business database could not be accessed. Confirm that the executing Google account can edit the spreadsheet.',
      SPREADSHEET_NOT_FOUND: 'The business database could not be found. Confirm SPREADSHEET_ID in Apps Script Script Properties.',
      SPREADSHEET_SCHEMA_NOT_READY: 'The business database is connected but its schema is not initialized. Run database initialization.',
      DRIVE_FOLDER_NOT_CONFIGURED: 'The root Drive folder is not configured. Add ROOT_DRIVE_FOLDER_ID in Apps Script Script Properties.',
      DRIVE_FOLDER_ACCESS_DENIED: 'The root Drive folder could not be accessed. Confirm that the executing Google account can access the folder.',
      DRIVE_FOLDER_NOT_FOUND: 'The root Drive folder could not be found. Confirm ROOT_DRIVE_FOLDER_ID in Apps Script Script Properties.',
      CALENDAR_NOT_CONFIGURED: 'The business calendar is not configured. Add CALENDAR_ID in Apps Script Script Properties.',
      CALENDAR_ACCESS_DENIED: 'The business calendar could not be accessed. Confirm that the executing Google account can see the calendar.',
      CALENDAR_NOT_FOUND: 'The business calendar could not be found. Confirm CALENDAR_ID in Apps Script Script Properties.',
      CALENDAR_TIMEZONE_MISMATCH: 'The business calendar timezone differs from Asia/Manila. Consider changing the calendar timezone.',
      INTEGRATION_CONNECTION_ERROR: 'A Google integration could not be verified. Please try again or contact the owner.',
      CLIENT_NOT_FOUND: 'The client was not found.',
      CLIENT_ALREADY_ARCHIVED: 'This client is already archived.',
      DUPLICATE_CLIENT: 'A client with the same contact details already exists. Duplicates are not merged automatically.',
      POSSIBLE_DUPLICATE_CLIENT: 'A possible duplicate client was found. Review the matches and record an override reason to continue.',
      CLIENT_CONTACT_REQUIRED: 'At least one contact method (phone, email, or social profile) is required.',
      LEAD_NOT_FOUND: 'The lead was not found.',
      LEAD_ALREADY_CONVERTED: 'This lead has already been converted to a client.',
      INVALID_LEAD_STATUS_TRANSITION: 'This lead status change is not allowed.',
      LEAD_LOST_REASON_REQUIRED: 'A lost reason is required when marking a lead as lost.',
      LEAD_CONVERSION_CONFLICT: 'The lead could not be converted because a matching client already exists. Link to the existing client instead.',
      PACKAGE_NOT_FOUND: 'The package was not found.',
      DUPLICATE_PACKAGE_NAME: 'An active package with this name already exists.',
      ADD_ON_NOT_FOUND: 'The add-on was not found.',
      DUPLICATE_ADD_ON_NAME: 'An active add-on with this name already exists.',
      INVALID_PACKAGE_COST: 'The package cost value is not valid.',
      INVALID_PACKAGE_PRICE: 'The package price value is not valid.',
      PACKAGE_ITEM_VALIDATION_ERROR: 'One or more package items are not valid.',
      BOOKING_NOT_FOUND: 'The booking was not found.',
      BOOKING_CLIENT_REQUIRED: 'A valid active client is required for a booking.',
      BOOKING_INVALID_STATUS: 'The booking status is not valid.',
      INVALID_BOOKING_STATUS_TRANSITION: 'This booking status change is not allowed.',
      BOOKING_CANCEL_REASON_REQUIRED: 'A cancellation reason is required.',
      BOOKING_ALREADY_CANCELLED: 'This booking is already cancelled.',
      BOOKING_ALREADY_ARCHIVED: 'This booking is already archived.',
      BOOKING_CONFLICT: 'This booking conflicts with another booking. Provide an override reason to continue.',
      BOOKING_TOTAL_MISMATCH: 'The booking total does not match the server calculation.',
      INVALID_DISCOUNT: 'The discount is not valid.',
      PACKAGE_SNAPSHOT_ERROR: 'The package could not be snapshotted.',
      PAYMENT_NOT_FOUND: 'The payment was not found.',
      PAYMENT_ALREADY_VOIDED: 'This payment is already voided.',
      PAYMENT_BOOKING_MISMATCH: 'The payment and booking clients do not match.',
      PAYMENT_EXCEEDS_BALANCE: 'The payment amount exceeds the booking balance. Confirm the overpayment to continue.',
      PAYMENT_LEDGER_POSTING_FAILED: 'The payment could not be posted to the cash ledger.',
      PAYMENT_LEDGER_LINK_MISSING: 'The payment is missing its linked cash transaction.',
      PAYMENT_VOID_REQUIRED: 'This cash transaction belongs to a payment. Void the payment from the Payments interface.',
      RECEIVABLE_CALCULATION_ERROR: 'The receivable could not be calculated.',
      REFUND_NOT_ALLOWED: 'A refund is not allowed for this payment.',
      REFUND_EXCEEDS_AVAILABLE_AMOUNT: 'The refund amount exceeds the available refundable amount.',
      SCHEDULE_CONFLICT: 'This schedule conflicts with another booking. Provide an override reason to continue.',
      EXPENSE_NOT_FOUND: 'The expense was not found.',
      EXPENSE_ALREADY_VOIDED: 'This expense is already voided.',
      EXPENSE_INVALID_STATUS_TRANSITION: 'This expense status change is not allowed.',
      EXPENSE_DIRECT_BOOKING_REQUIRED: 'Direct costs must be tagged to a booking.',
      EXPENSE_OPERATING_CANNOT_LINK: 'Operating expenses cannot be tagged to a booking.',
      EXPENSE_SUBMIT_REASON_REQUIRED: 'A reason is required for this expense action.',
      EXPENSE_APPROVER_CONFLICT: 'The approver and the payer must be different people.',
      EXPENSE_VOID_REQUIRED: 'This cash transaction belongs to an expense. Void the expense from the Expenses interface.',
      EXPENSE_PAY_REQUIRES_APPROVAL: 'Only approved expenses can be paid.',
      EXPENSE_ALREADY_PAID: 'This expense is already paid.',
      BOOKING_COSTS_DUPLICATE: 'A cost record already exists for this booking.',
      OPERATING_ALLOCATION_OFF: 'Operating cost allocation is disabled in Settings.',
      ITEM_NOT_FOUND: 'The inventory item was not found.',
      ITEM_INACTIVE: 'The inventory item is inactive.',
      ITEM_SKU_CONFLICT: 'An active inventory item with this SKU already exists.',
      NEGATIVE_STOCK: 'The stock movement would make inventory negative. Add stock or adjust before recording this usage.',
      PURCHASE_NOT_FOUND: 'The purchase order was not found.',
      PURCHASE_LINE_NOT_FOUND: 'The purchase order line was not found.',
      PURCHASE_INVALID_STATUS: 'This purchase order status change is not allowed.',
      PURCHASE_CANCEL_REASON_REQUIRED: 'A cancellation reason is required.',
      PURCHASE_RECEIVED_EXCEEDS_QTY: 'The received quantity exceeds the remaining quantity on the purchase line.',
      PURCHASE_ALREADY_RECEIVED: 'This purchase order is already fully received.',
      RECEIPT_IDEMPOTENCY_EXISTS: 'This purchase receipt was already recorded.',
      SUPPLIER_NOT_FOUND: 'The supplier was not found.',
      SUPPLIER_INACTIVE: 'The supplier is inactive.',
      SUPPLIER_NAME_CONFLICT: 'An active supplier with this name already exists.',
      EQUIPMENT_NOT_FOUND: 'The equipment was not found.',
      EQUIPMENT_INVALID_STATUS_TRANSITION: 'This equipment status change is not allowed.',
      EQUIPMENT_WRITE_OFF_REASON_REQUIRED: 'A reason is required to write off equipment.',
      EQUIPMENT_REASON_REQUIRED: 'A reason is required for this equipment action.',
      EQUIPMENT_LINE_MISSING: 'This purchase line has no inventory item to receive.',
      TASK_NOT_FOUND: 'The task was not found.',
      TASK_INVALID_STATUS_TRANSITION: 'This task status change is not allowed.',
      TASK_CANCEL_REASON_REQUIRED: 'A reason is required to cancel this task.',
      PRODUCTION_READY_REQUIRED: 'Production must be fully ready before deployment can be created.',
      PRODUCTION_ALREADY_READY: 'Production is already ready to deploy.',
      PRODUCTION_BOOKING_REQUIRED: 'A production plan requires a valid booking.',
      PRODUCTION_BOOKING_UNAVAILABLE: 'The booking is not available for production planning.',
      PRODUCTION_NOT_READY: 'Production is not ready. Complete the checklist and confirm crew before deploying.',
      DEPLOYMENT_NOT_FOUND: 'The deployment was not found.',
      DEPLOYMENT_ALREADY_EXISTS: 'A deployment already exists for this booking.',
      DEPLOYMENT_INVALID_STATUS_TRANSITION: 'This deployment status change is not allowed.',
      DEPLOYMENT_NOT_RECONCILED_CANNOT_CLOSE: 'A deployment must be reconciled before it can be closed.',
      DEPLOYMENT_BOOKING_MISMATCH: 'The deployment and booking do not match.',
      DEPLOYMENT_ITEM_NOT_FOUND: 'The deployment item was not found.',
      DEPLOYMENT_EQUIPMENT_NOT_FOUND: 'The deployment equipment entry was not found.',
      DEPLOYMENT_CHECKLIST_INCOMPLETE: 'The deployment checklist must be complete before reconciliation.',
      DEPLOYMENT_CREW_SIGN_OFF_REQUIRED: 'All crew must sign off before the deployment can be reconciled.',
      DEPLOYMENT_RETURN_QTY_INVALID: 'The returned quantity must be between 0 and the loaded quantity.',
      DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY: 'The requested quantity exceeds what is available.',
      DEPLOYMENT_ITEM_CONSUMED_BLOCKED: 'Reconciled deployments cannot be edited; record an adjustment instead.',
      DEPLOYMENT_RECONCILED: 'The deployment is already reconciled.',
      DEPLOYMENT_LOADED_LOCKED: 'Loaded quantities are locked once the deployment has departed.',
      DEPLOYMENT_CLOSED: 'This deployment is already closed.',
      DEPLOYMENT_INCIDENT_NOT_FOUND: 'The deployment incident was not found.',
      DEPLOYMENT_SEVERITY_INVALID: 'The incident severity is not valid.',
      DEPLOYMENT_BOOKING_INCOMPATIBLE: 'The deployment does not belong to this booking.',
      DEPLOYMENT_EQUIPMENT_ASSIGNED: 'The equipment is already assigned to a deployment.',
      DEPLOYMENT_EQUIPMENT_ALREADY_RETURNED: 'This equipment has already been returned.',
      DEPLOYMENT_EDIT_BLOCKED: 'This deployment can no longer be edited in its current status.',
      DEPLOYMENT_CHECKLIST_ITEM_NOT_FOUND: 'The checklist item was not found.',
      DEPLOYMENT_SIGNOFF_REQUIRED: 'Crew sign-off is required before reconciliation.',
      DEPLOYMENT_ITEM_CONFLICT: 'The deployment item conflicts with another record.',
      DEPLOYMENT_ITEM_EDIT_BLOCKED: 'Deployment items can no longer be edited in their current state.',
      CREW_MEMBER_NOT_FOUND: 'The crew member was not found.',
      CREW_MEMBER_INACTIVE: 'The crew member is inactive.',
      CREW_ASSIGNMENT_NOT_FOUND: 'The crew assignment was not found.',
      CREW_ASSIGNMENT_BOOKING_REQUIRED: 'A crew assignment requires a booking or a deployment.',
      CREW_ASSIGNMENT_ALREADY_PAID: 'This crew assignment has already been paid. Void the payment to reopen it.',
      CREW_PAYMENT_NOT_FOUND: 'The crew payment was not found.',
      CREW_PAYMENT_DUPLICATE: 'This crew payment has already been recorded.',
      CREW_PAYMENT_AMOUNT_MISMATCH: 'The payment amount must match the assignment pay amount.',
      CREW_PAYMENT_ALREADY_VOIDED: 'This crew payment is already voided.',
      CREW_PAYMENT_VOID_REQUIRED: 'This cash transaction belongs to a crew payment. Void the crew payment from the Crew interface.',
      PARTNER_NOT_FOUND: 'The partner was not found.',
      PARTNER_INACTIVE: 'The partner is inactive.',
      PARTNER_NAME_CONFLICT: 'An active partner with this name already exists.',
      COMMISSION_NOT_FOUND: 'The commission record was not found.',
      COMMISSION_NOT_DUE: 'Only DUE commissions can be settled.',
      COMMISSION_ALREADY_PAID: 'This commission already has a linked cash transaction.',
      COMMISSION_NOT_PAID: 'Only PAID commissions can be voided.',
      COMMISSION_VOID_REQUIRED: 'This cash transaction belongs to a partner commission. Void the commission from the Partners interface.',
      REPORT_NOT_FOUND: 'The requested report does not exist.',
      REPORT_GENERATION_FAILED: 'The report could not be generated. Please try again or contact the owner.',
      REPORT_EXPORT_FAILED: 'The report could not be exported. Please try again.',
      FILE_NOT_FOUND: 'The file record was not found.',
      FILE_UPLOAD_FAILED: 'The file could not be uploaded to Drive. Please try again.',
      FILE_PERMISSION_DENIED: 'Your role is not allowed to manage files for this record.',
      DRIVE_FOLDER_NOT_FOUND: 'The Drive folder for this record could not be found.',
      DRIVE_FOLDER_CREATE_FAILED: 'The Drive folder could not be created.',
      FILE_TRASH_FAILED: 'The file could not be trashed.',
      CALENDAR_NOT_CONFIGURED: 'The business calendar is not configured. Set CALENDAR_ID in Script Properties.',
      CALENDAR_SYNC_FAILED: 'The booking could not be mirrored to the calendar.',
      CALENDAR_EVENT_NOT_FOUND: 'The mirrored calendar event was not found.',
      CALENDAR_EVENT_UPDATE_FAILED: 'The calendar event could not be updated.',
      CALENDAR_PERMISSION_DENIED: 'The business calendar denied access to the requested event.',
      BACKUP_FAILED: 'The backup could not be completed.',
      BACKUP_FOLDER_NOT_FOUND: 'The backup Drive folder could not be found or created.',
      BACKUP_VERIFICATION_FAILED: 'Backup verification failed. Check the backup files.',
      BACKUP_RESTORE_REQUIRES_TEST: 'Restores may only be performed against a test workbook.',
      AUTOMATION_NOT_CONFIGURED: 'Automation requires configuration before it can run.',
      TRIGGER_SETUP_FAILED: 'The automation triggers could not be created.',
      DIGEST_SEND_FAILED: 'The digest email could not be sent.',
      DIGEST_RECIPIENT_INVALID: 'The digest recipient address is not valid.',
      FILE_ENTITY_PENDING: 'Files are not yet supported for this record type.'
    };
    return map[safe.code] || safe.message || map.INTERNAL_ERROR;
  }

  /**
   * Safe details object for client responses.
   * Never contains stack traces or secrets.
   */
  function toSafeDetails(err) {
    var safe = normalize(err);
    var details = {};
    if (safe.code) {
      details.code = safe.code;
    }
    if (safe.category) {
      details.category = safe.category;
    }
    if (typeof safe.details === 'string' && safe.details.length <= 300) {
      details.details = safe.details;
    }
    return details;
  }

  /**
   * Wraps an executor with try/catch that logs internally and rethrows
   * a safe error containing only user-friendly information.
   */
  function wrap(fn) {
    return function () {
      try {
        return fn.apply(null, arguments);
      } catch (err) {
        var safe = normalize(err);
        LoggerService.error('ErrorService.wrap', 'Operation failed: ' + safe.code, {
          code: safe.code,
          category: safe.category
        });
        throw safe;
      }
    };
  }

  return {
    create: create,
    normalize: normalize,
    toUserMessage: toUserMessage,
    toSafeDetails: toSafeDetails,
    wrap: wrap,
    CATEGORY_VALIDATION: CATEGORY_VALIDATION,
    CATEGORY_CONFIGURATION: CATEGORY_CONFIGURATION,
    CATEGORY_NOT_FOUND: CATEGORY_NOT_FOUND,
    CATEGORY_PERMISSION: CATEGORY_PERMISSION,
    CATEGORY_CONFLICT: CATEGORY_CONFLICT,
    CATEGORY_INTERNAL: CATEGORY_INTERNAL,
    CODES: {
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
      NOT_FOUND: 'NOT_FOUND',
      PERMISSION_DENIED: 'PERMISSION_DENIED',
      CONFLICT: 'CONFLICT',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
      DATABASE_NOT_CONFIGURED: 'DATABASE_NOT_CONFIGURED',
      DRIVE_NOT_CONFIGURED: 'DRIVE_NOT_CONFIGURED',
      AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
      USER_NOT_REGISTERED: 'USER_NOT_REGISTERED',
      SETUP_PERMISSION_DENIED: 'SETUP_PERMISSION_DENIED',
      AUTOMATION_SETUP_FAILED: 'AUTOMATION_SETUP_FAILED',
      SYSTEM_HEALTH_FAILED: 'SYSTEM_HEALTH_FAILED',
      DATABASE_INITIALIZATION_FAILED: 'DATABASE_INITIALIZATION_FAILED',
      DATABASE_NOT_INITIALIZED: 'DATABASE_NOT_INITIALIZED',
      SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
      SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
      ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
      ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
      CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
      CATEGORY_INACTIVE: 'CATEGORY_INACTIVE',
      INVALID_TRANSACTION_TYPE: 'INVALID_TRANSACTION_TYPE',
      INVALID_AMOUNT: 'INVALID_AMOUNT',
      INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
      DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
      TRANSFER_ACCOUNT_CONFLICT: 'TRANSFER_ACCOUNT_CONFLICT',
      TRANSACTION_ALREADY_VOIDED: 'TRANSACTION_ALREADY_VOIDED',
      TRANSFER_INTEGRITY_ERROR: 'TRANSFER_INTEGRITY_ERROR',
      RECONCILIATION_ALREADY_EXISTS: 'RECONCILIATION_ALREADY_EXISTS',
      LOCK_TIMEOUT: 'LOCK_TIMEOUT',
      SCHEMA_NOT_DEFINED: 'SCHEMA_NOT_DEFINED',
      TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
      SPREADSHEET_NOT_CONFIGURED: 'SPREADSHEET_NOT_CONFIGURED',
      SPREADSHEET_ACCESS_DENIED: 'SPREADSHEET_ACCESS_DENIED',
      SPREADSHEET_NOT_FOUND: 'SPREADSHEET_NOT_FOUND',
      SPREADSHEET_SCHEMA_NOT_READY: 'SPREADSHEET_SCHEMA_NOT_READY',
      DRIVE_FOLDER_NOT_CONFIGURED: 'DRIVE_FOLDER_NOT_CONFIGURED',
      DRIVE_FOLDER_ACCESS_DENIED: 'DRIVE_FOLDER_ACCESS_DENIED',
      DRIVE_FOLDER_NOT_FOUND: 'DRIVE_FOLDER_NOT_FOUND',
      CALENDAR_NOT_CONFIGURED: 'CALENDAR_NOT_CONFIGURED',
      CALENDAR_ACCESS_DENIED: 'CALENDAR_ACCESS_DENIED',
      CALENDAR_NOT_FOUND: 'CALENDAR_NOT_FOUND',
      CALENDAR_TIMEZONE_MISMATCH: 'CALENDAR_TIMEZONE_MISMATCH',
      INTEGRATION_CONNECTION_ERROR: 'INTEGRATION_CONNECTION_ERROR',
      CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
      CLIENT_ALREADY_ARCHIVED: 'CLIENT_ALREADY_ARCHIVED',
      DUPLICATE_CLIENT: 'DUPLICATE_CLIENT',
      POSSIBLE_DUPLICATE_CLIENT: 'POSSIBLE_DUPLICATE_CLIENT',
      CLIENT_CONTACT_REQUIRED: 'CLIENT_CONTACT_REQUIRED',
      LEAD_NOT_FOUND: 'LEAD_NOT_FOUND',
      LEAD_ALREADY_CONVERTED: 'LEAD_ALREADY_CONVERTED',
      INVALID_LEAD_STATUS_TRANSITION: 'INVALID_LEAD_STATUS_TRANSITION',
      LEAD_LOST_REASON_REQUIRED: 'LEAD_LOST_REASON_REQUIRED',
      LEAD_CONVERSION_CONFLICT: 'LEAD_CONVERSION_CONFLICT',
      PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
      DUPLICATE_PACKAGE_NAME: 'DUPLICATE_PACKAGE_NAME',
      ADD_ON_NOT_FOUND: 'ADD_ON_NOT_FOUND',
      DUPLICATE_ADD_ON_NAME: 'DUPLICATE_ADD_ON_NAME',
      INVALID_PACKAGE_COST: 'INVALID_PACKAGE_COST',
      INVALID_PACKAGE_PRICE: 'INVALID_PACKAGE_PRICE',
      PACKAGE_ITEM_VALIDATION_ERROR: 'PACKAGE_ITEM_VALIDATION_ERROR',
      BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
      BOOKING_CLIENT_REQUIRED: 'BOOKING_CLIENT_REQUIRED',
      BOOKING_INVALID_STATUS: 'BOOKING_INVALID_STATUS',
      INVALID_BOOKING_STATUS_TRANSITION: 'INVALID_BOOKING_STATUS_TRANSITION',
      BOOKING_CANCEL_REASON_REQUIRED: 'BOOKING_CANCEL_REASON_REQUIRED',
      BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
      BOOKING_ALREADY_ARCHIVED: 'BOOKING_ALREADY_ARCHIVED',
      BOOKING_CONFLICT: 'BOOKING_CONFLICT',
      BOOKING_TOTAL_MISMATCH: 'BOOKING_TOTAL_MISMATCH',
      INVALID_DISCOUNT: 'INVALID_DISCOUNT',
      PACKAGE_SNAPSHOT_ERROR: 'PACKAGE_SNAPSHOT_ERROR',
      PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
      PAYMENT_ALREADY_VOIDED: 'PAYMENT_ALREADY_VOIDED',
      PAYMENT_BOOKING_MISMATCH: 'PAYMENT_BOOKING_MISMATCH',
      PAYMENT_EXCEEDS_BALANCE: 'PAYMENT_EXCEEDS_BALANCE',
      PAYMENT_LEDGER_POSTING_FAILED: 'PAYMENT_LEDGER_POSTING_FAILED',
      PAYMENT_LEDGER_LINK_MISSING: 'PAYMENT_LEDGER_LINK_MISSING',
      PAYMENT_VOID_REQUIRED: 'PAYMENT_VOID_REQUIRED',
      RECEIVABLE_CALCULATION_ERROR: 'RECEIVABLE_CALCULATION_ERROR',
      REFUND_NOT_ALLOWED: 'REFUND_NOT_ALLOWED',
      REFUND_EXCEEDS_AVAILABLE_AMOUNT: 'REFUND_EXCEEDS_AVAILABLE_AMOUNT',
      SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT', 'EXPENSE_NOT_FOUND': 'EXPENSE_NOT_FOUND',
      EXPENSE_ALREADY_VOIDED: 'EXPENSE_ALREADY_VOIDED',
      EXPENSE_INVALID_STATUS_TRANSITION: 'EXPENSE_INVALID_STATUS_TRANSITION',
      EXPENSE_DIRECT_BOOKING_REQUIRED: 'EXPENSE_DIRECT_BOOKING_REQUIRED',
      EXPENSE_OPERATING_CANNOT_LINK: 'EXPENSE_OPERATING_CANNOT_LINK',
      EXPENSE_SUBMIT_REASON_REQUIRED: 'EXPENSE_SUBMIT_REASON_REQUIRED',
      EXPENSE_APPROVER_CONFLICT: 'EXPENSE_APPROVER_CONFLICT',
      EXPENSE_VOID_REQUIRED: 'EXPENSE_VOID_REQUIRED',
      EXPENSE_PAY_REQUIRES_APPROVAL: 'EXPENSE_PAY_REQUIRES_APPROVAL',
      EXPENSE_ALREADY_PAID: 'EXPENSE_ALREADY_PAID',
      BOOKING_COSTS_DUPLICATE: 'BOOKING_COSTS_DUPLICATE',
      OPERATING_ALLOCATION_OFF: 'OPERATING_ALLOCATION_OFF',
      ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
      ITEM_INACTIVE: 'ITEM_INACTIVE',
      ITEM_SKU_CONFLICT: 'ITEM_SKU_CONFLICT',
      NEGATIVE_STOCK: 'NEGATIVE_STOCK',
      PURCHASE_NOT_FOUND: 'PURCHASE_NOT_FOUND',
      PURCHASE_LINE_NOT_FOUND: 'PURCHASE_LINE_NOT_FOUND',
      PURCHASE_INVALID_STATUS: 'PURCHASE_INVALID_STATUS',
      PURCHASE_CANCEL_REASON_REQUIRED: 'PURCHASE_CANCEL_REASON_REQUIRED',
      PURCHASE_RECEIVED_EXCEEDS_QTY: 'PURCHASE_RECEIVED_EXCEEDS_QTY',
      PURCHASE_ALREADY_RECEIVED: 'PURCHASE_ALREADY_RECEIVED',
      RECEIPT_IDEMPOTENCY_EXISTS: 'RECEIPT_IDEMPOTENCY_EXISTS',
      SUPPLIER_NOT_FOUND: 'SUPPLIER_NOT_FOUND',
      SUPPLIER_INACTIVE: 'SUPPLIER_INACTIVE',
      SUPPLIER_NAME_CONFLICT: 'SUPPLIER_NAME_CONFLICT',
      EQUIPMENT_NOT_FOUND: 'EQUIPMENT_NOT_FOUND',
      EQUIPMENT_INVALID_STATUS_TRANSITION: 'EQUIPMENT_INVALID_STATUS_TRANSITION',
      EQUIPMENT_WRITE_OFF_REASON_REQUIRED: 'EQUIPMENT_WRITE_OFF_REASON_REQUIRED',
      EQUIPMENT_REASON_REQUIRED: 'EQUIPMENT_REASON_REQUIRED',
      EQUIPMENT_LINE_MISSING: 'EQUIPMENT_LINE_MISSING',
      TASK_NOT_FOUND: 'TASK_NOT_FOUND',
      TASK_INVALID_STATUS_TRANSITION: 'TASK_INVALID_STATUS_TRANSITION',
      TASK_CANCEL_REASON_REQUIRED: 'TASK_CANCEL_REASON_REQUIRED',
      PRODUCTION_READY_REQUIRED: 'PRODUCTION_READY_REQUIRED',
      PRODUCTION_ALREADY_READY: 'PRODUCTION_ALREADY_READY',
      PRODUCTION_BOOKING_REQUIRED: 'PRODUCTION_BOOKING_REQUIRED',
      PRODUCTION_BOOKING_UNAVAILABLE: 'PRODUCTION_BOOKING_UNAVAILABLE',
      PRODUCTION_NOT_READY: 'PRODUCTION_NOT_READY',
      DEPLOYMENT_NOT_FOUND: 'DEPLOYMENT_NOT_FOUND',
      DEPLOYMENT_ALREADY_EXISTS: 'DEPLOYMENT_ALREADY_EXISTS',
      DEPLOYMENT_INVALID_STATUS_TRANSITION: 'DEPLOYMENT_INVALID_STATUS_TRANSITION',
      DEPLOYMENT_NOT_RECONCILED_CANNOT_CLOSE: 'DEPLOYMENT_NOT_RECONCILED_CANNOT_CLOSE',
      DEPLOYMENT_BOOKING_MISMATCH: 'DEPLOYMENT_BOOKING_MISMATCH',
      DEPLOYMENT_ITEM_NOT_FOUND: 'DEPLOYMENT_ITEM_NOT_FOUND',
      DEPLOYMENT_EQUIPMENT_NOT_FOUND: 'DEPLOYMENT_EQUIPMENT_NOT_FOUND',
      DEPLOYMENT_CHECKLIST_INCOMPLETE: 'DEPLOYMENT_CHECKLIST_INCOMPLETE',
      DEPLOYMENT_CREW_SIGN_OFF_REQUIRED: 'DEPLOYMENT_CREW_SIGN_OFF_REQUIRED',
      DEPLOYMENT_RETURN_QTY_INVALID: 'DEPLOYMENT_RETURN_QTY_INVALID',
      DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY: 'DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY',
      DEPLOYMENT_ITEM_CONSUMED_BLOCKED: 'DEPLOYMENT_ITEM_CONSUMED_BLOCKED',
      DEPLOYMENT_RECONCILED: 'DEPLOYMENT_RECONCILED',
      DEPLOYMENT_LOADED_LOCKED: 'DEPLOYMENT_LOADED_LOCKED',
      DEPLOYMENT_CLOSED: 'DEPLOYMENT_CLOSED',
      DEPLOYMENT_INCIDENT_NOT_FOUND: 'DEPLOYMENT_INCIDENT_NOT_FOUND',
      DEPLOYMENT_SEVERITY_INVALID: 'DEPLOYMENT_SEVERITY_INVALID',
      DEPLOYMENT_BOOKING_INCOMPATIBLE: 'DEPLOYMENT_BOOKING_INCOMPATIBLE',
      DEPLOYMENT_EQUIPMENT_ASSIGNED: 'DEPLOYMENT_EQUIPMENT_ASSIGNED',
      DEPLOYMENT_EQUIPMENT_ALREADY_RETURNED: 'DEPLOYMENT_EQUIPMENT_ALREADY_RETURNED',
      DEPLOYMENT_EDIT_BLOCKED: 'DEPLOYMENT_EDIT_BLOCKED',
      DEPLOYMENT_CHECKLIST_ITEM_NOT_FOUND: 'DEPLOYMENT_CHECKLIST_ITEM_NOT_FOUND',
      DEPLOYMENT_SIGNOFF_REQUIRED: 'DEPLOYMENT_SIGNOFF_REQUIRED',
      DEPLOYMENT_ITEM_CONFLICT: 'DEPLOYMENT_ITEM_CONFLICT',
      DEPLOYMENT_ITEM_EDIT_BLOCKED: 'DEPLOYMENT_ITEM_EDIT_BLOCKED',
      CREW_MEMBER_NOT_FOUND: 'CREW_MEMBER_NOT_FOUND',
      CREW_MEMBER_INACTIVE: 'CREW_MEMBER_INACTIVE',
      CREW_ASSIGNMENT_NOT_FOUND: 'CREW_ASSIGNMENT_NOT_FOUND',
      CREW_ASSIGNMENT_BOOKING_REQUIRED: 'CREW_ASSIGNMENT_BOOKING_REQUIRED',
      CREW_ASSIGNMENT_ALREADY_PAID: 'CREW_ASSIGNMENT_ALREADY_PAID',
      CREW_PAYMENT_NOT_FOUND: 'CREW_PAYMENT_NOT_FOUND',
      CREW_PAYMENT_DUPLICATE: 'CREW_PAYMENT_DUPLICATE',
      CREW_PAYMENT_AMOUNT_MISMATCH: 'CREW_PAYMENT_AMOUNT_MISMATCH',
      CREW_PAYMENT_ALREADY_VOIDED: 'CREW_PAYMENT_ALREADY_VOIDED',
      CREW_PAYMENT_VOID_REQUIRED: 'CREW_PAYMENT_VOID_REQUIRED',
      PARTNER_NOT_FOUND: 'PARTNER_NOT_FOUND',
      PARTNER_INACTIVE: 'PARTNER_INACTIVE',
      PARTNER_NAME_CONFLICT: 'PARTNER_NAME_CONFLICT',
      COMMISSION_NOT_FOUND: 'COMMISSION_NOT_FOUND',
      COMMISSION_NOT_DUE: 'COMMISSION_NOT_DUE',
      COMMISSION_ALREADY_PAID: 'COMMISSION_ALREADY_PAID',
      COMMISSION_NOT_PAID: 'COMMISSION_NOT_PAID',
      COMMISSION_VOID_REQUIRED: 'COMMISSION_VOID_REQUIRED',
      REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
      REPORT_GENERATION_FAILED: 'REPORT_GENERATION_FAILED',
      REPORT_EXPORT_FAILED: 'REPORT_EXPORT_FAILED',
      FILE_NOT_FOUND: 'FILE_NOT_FOUND',
      FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
      FILE_PERMISSION_DENIED: 'FILE_PERMISSION_DENIED',
      DRIVE_FOLDER_NOT_FOUND: 'DRIVE_FOLDER_NOT_FOUND',
      DRIVE_FOLDER_CREATE_FAILED: 'DRIVE_FOLDER_CREATE_FAILED',
      FILE_TRASH_FAILED: 'FILE_TRASH_FAILED',
      CALENDAR_NOT_CONFIGURED: 'CALENDAR_NOT_CONFIGURED',
      CALENDAR_SYNC_FAILED: 'CALENDAR_SYNC_FAILED',
      CALENDAR_EVENT_NOT_FOUND: 'CALENDAR_EVENT_NOT_FOUND',
      CALENDAR_EVENT_UPDATE_FAILED: 'CALENDAR_EVENT_UPDATE_FAILED',
      CALENDAR_PERMISSION_DENIED: 'CALENDAR_PERMISSION_DENIED',
      BACKUP_FAILED: 'BACKUP_FAILED',
      BACKUP_FOLDER_NOT_FOUND: 'BACKUP_FOLDER_NOT_FOUND',
      BACKUP_VERIFICATION_FAILED: 'BACKUP_VERIFICATION_FAILED',
      BACKUP_RESTORE_REQUIRES_TEST: 'BACKUP_RESTORE_REQUIRES_TEST',
      AUTOMATION_NOT_CONFIGURED: 'AUTOMATION_NOT_CONFIGURED',
      TRIGGER_SETUP_FAILED: 'TRIGGER_SETUP_FAILED',
      DIGEST_SEND_FAILED: 'DIGEST_SEND_FAILED',
      DIGEST_RECIPIENT_INVALID: 'DIGEST_RECIPIENT_INVALID',
      FILE_ENTITY_PENDING: 'FILE_ENTITY_PENDING'
    }
  };
})();
