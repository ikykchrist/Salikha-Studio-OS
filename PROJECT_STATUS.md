# PROJECT_STATUS.md

> Living project tracker for Salikha Studio OS. Updated after every completed task.

## Current Snapshot

| Field | Value |
|---|---|
| Project phase | Sprint 9 - Stabilization & Release Readiness |
| Current sprint | Sprint 9 (in progress) |
| Status | Sprint 9 (in progress). Audit matrix in progress; P1 Files-permission boundary fixed; hardening section 56 + Sprint 5/9 inventory hardening pass landed (942/942); Sprint 5/9 Purchasing module completion pass landed (979/979) and **owner verification PASSED** - Purchasing FULLY FUNCTIONAL; mobile usability pass shipped (≤640px: 44px touch targets, bottom-sheet modals, sticky bottom action bar, no sticky hover, iOS zoom fix); RBAC still a documented temporary boundary pending the Users sheet; remaining modules (Equipment, Inventory, Production pages, etc.) still pending |
| Version | 0.9.1-sprint9 |
| Last updated | 2026-08-09 |

## Current Objective

(Active) Execute Sprint 9 final stabilization: audit/fix/test the full system with no new business features, then deliver the Sprint 9 report (status per module, P0-P3 findings, readiness verdict) for owner acceptance.

## Sprint 9 Work Completed

- **First-run setup flow (boot gate, 2026-08-09):** `SystemInitializationService.gs` (read-only `getSetupStatus()` + idempotent 10-step `runInitialization(actor)` - account/authorization/database/catalog/drive/calendar/health/automation/backup/security; marker only on full success, never destroys data), `SetupController.gs` + `SetupPermissionService.gs` (OWNER/ADMIN gate, temporary no-role boundary per `SECURITY_MODEL` §2.1), new error codes + audit actions, `BackupService.ensureBackupStructure()` (Drive-only readiness probe - no `SpreadsheetApp` dependency). Frontend boot gate routes to `#/setup` until initialized and back to `#/dashboard` once ready; setup page with step list + initialize button (`setup-page.html`, `setup-scripts.html`, `window.SETUP`). Tests: harness section 57 - full suite **942 passed / 0 failed**. Deploy pending owner.
- **Sprint 5/9 inventory hardening (backend, 2026-08-09):** `InventoryMovementService.recordStockIn` / `recordUsage` / `recordStockReturn` now return the **real** stored `movementId` (previous return-id mismatch would have orphaned caller-side ids from the sheet). `InventoryService.listItems` does ONE full-sheet read of `InventoryBatches` (down from N+1); new `getPageData` and `getItemDetailView` endpoints (`InventoryController.getInventoryPageData` / `getInventoryItemDetailView`) give the future Inventory page the summary KPIs + lookups and item+balance+batches+moves in a single request. `recordOpeningStock` routes through `recordStockIn` with `SOURCE_OPENING` and writes a distinct `OPENING_STOCK_RECORDED` audit row. `recordUsage` accepts `STOCK_USAGE` / `WRITE_OFF` / `ADJUSTMENT` with the matching audit action. New `InventoryPermissionService.gs` enforces the OWNER/ADMIN/OPERATIONS write matrix (FINANCE/CREW/VIEWER read-only) once actors carry a role; same posture as `FilePermissionService` / `ReportPermissionService` (actors without a role still allowed under the documented temporary boundary, `SECURITY_MODEL §2.1`). `InventoryController` guards every mutation entry point through `guardInventoryWrite()`. Tests: full suite **942 passed / 0 failed**; new TESTING_CHECKLIST rows S5-RH-1..8. Deployment of the controller changes pending owner.
- **Purchasing module completion (backend + frontend, 2026-08-09):** `PurchaseService.getPageData(filters)` returns the summary KPIs (status counts + supplier totals), enriched rows (supplier name + line count + ordered/received totals + progressPct), and inventory-item + supplier lookups in a single request. `getDetailView(purchaseId)` returns the purchase + lines + receipt history derived from `InventoryMovements` (source `PO_RECEIPT`). `aggregateSuppliers(filters)` builds the supplier panel (purchaseCount + lastPurchaseDate) in one read. New `PurchasePermissionService.gs` enforces the OWNER/ADMIN/OPERATIONS write matrix (FINANCE/CREW/VIEWER read-only); `PurchaseController` guards every mutation entry point through `guardPurchasingWrite()`. `receivePurchase` now strictly throws `PURCHASE_RECEIVED_EXCEEDS_QTY` on over-receipt (no silent cap); the `-1` "fill remaining" sentinel is still honoured for full receipts. Frontend: `src/purchasing-page.html` + `src/purchasing-components.html` + `src/purchasing-scripts.html` wired through `src/index.html` and `src/scripts.html`; the sidebar Purchasing nav now opens the full page (KPIs, supplier panel, purchase list with debounced search + status/supplier/sort filters + pagination, detail workspace, receive modal) instead of the placeholder. Mobile cards render the same `lineCount` + `progressPct` shape on small viewports. Tests: harness section 58 added (37 new checks); full suite **979 passed / 0 failed**; new TESTING_CHECKLIST rows S5P-1..18. **Owner verification PASSED on the deployed web app 2026-08-09 - Purchasing module FULLY FUNCTIONAL** (manual run-through: supplier create -> PO draft -> edit -> place order -> partial receipt 60/20 -> second receipt 40/30 -> status RECEIVED, with idempotency, over-receipt rejection, no-cash-on-receipt, and audit trail all confirmed).
- **Settings init fix (2026-08-08):** "Initialize database" button added to the Settings Business Database card (deployed @17) - the action previously lived only on the Cashflow page while Settings told users to run it.
- **Deployment (2026-08-08):** code pushed (`clasp push --force`, 134 files), version 15 created, web app deployment **@15 "Production - Sprint 9 mobile"** live at `https://script.google.com/macros/s/AKfycbxs99ahdIyKqFOoufvYYCMhtGYv6qxNUALMWTKazN0VBx9TEcmQETshj1Dr12Oxr3qWCg/exec`. Rollback: redeploy version 14. Owner next steps: open the URL, re-authorize scopes, run Settings > Check Connections, then the S9-3/S9-4/S9-5 runtime verification pass on phone + desktop.
- **Mobile usability pass (frontend, S9-4 prep):** per `docs/DESIGN_SYSTEM.md` §23/§24 - on screens ≤ 640px: 44px touch targets, 16px inputs/selects (stops iOS auto-zoom on focus), modals become bottom sheets with a sticky safe-area-aware footer, `.section-actions` moves to a sticky bottom action bar on mobile (`ensureMobileActionBars` in `src/scripts.html` - keeps money-flow primaries reachable while scrolling), table scrolling is momentum-based with contained overscroll, `(hover: none)` disables stuck hover tints, toasts center at the top. Desktop layout unchanged.
- **Fixed - Files module owner lockout (P1):** `FilePermissionService.canUpload/canTrash/canRead` returned `false` for actors without a role; the production server path (`FileController` -> `AuditService.getActor()`, which never carries a role until the Users sheet lands) therefore denied every upload/list/trash, owner included. Actors without a role are now allowed per the documented temporary boundary (`docs/SECURITY_MODEL.md` §2.1), while explicit roles remain enforced (regression-locked by tests).
- **Ledger parity:** new checks assert dashboard money pulse + account balance cache == ledger total.
- **Tests:** Sprint 9 section 56 added; full suite **909 passed / 0 failed**.

## Sprint 8 Features Completed

- **Files module:** `FileRepository`/`FileService`/`FileController`/`FilePermissionService` - Drive-scoped uploads under the entity folder tree, filename sanitization, trash (soft) + double-trash rejection, role-scoped access, summaries that never expose drive IDs.
- **Calendar mirror:** `CalendarService` (configured flag, event create/update/remove with external-id mapping) + `CalendarSyncService` (eligibility split: status-ineligible = SKIPPED, eligible-but-no-date = FAILED; idempotent create/update/remove by external id; cancelled bookings remove events).
- **SyncLogs:** `SyncLogService` - append-only sync bookkeeping with `recentFailures` public shape and timestamp+row-index ordering.
- **Backups:** `BackupService` - daily/weekly Drive copies + per-sheet CSV exports, metadata in SystemMetadata, retention (`KEEP_DAILY`), verification, off-site mirror, restore drill gated to test workbooks (audited, logged).
- **Automation:** `AutomationTriggerService` (4 timer jobs: daily backup, verification, weekly off-site, weekly digest) + `AutomationController` (status, install/remove, runBackupNow with `BACKUP_FAILED` failure envelope, digest recipient config, timer handlers that return `runJob` results and never throw).
- **Digest + notifications:** `DigestService` (recipient config with email validation, sync-failure sections) + `NotificationService.sendEmail`; digest audit entries never include email bodies.
- **Tests:** Sprint 8 sections 47-54 added - full suite **879 passed / 0 failed**.

### Sprint 8 Review Hardening (backend; 2026-08-08, section 55)

- **Calendar failure audit:** failed calendar syncs now write `CALENDAR_SYNC_FAILED` (WARNING) audit entries for the no-event-date path, `syncBooking` exceptions, and `removeBookingEvent` failures (previously SyncLogs only).
- **Job audit attribution:** `runJob` audits digest jobs as `DIGEST_SENT`/`DIGEST_FAILED` and logs their failures under `EMAIL` SyncLogs - the weekly digest was previously recorded as a backup job.
- **Low-stock alert audit:** digests that include a low-stock section now fire a `LOW_STOCK_ALERT_SENT` audit entry.
- **Error contract:** `CALENDAR_PERMISSION_DENIED` added to `ErrorService.CODES` to complete the documented Sprint 8 code set.
- **Checks added:** reschedule re-sync updates the SAME mirrored event (new schedule, no twin), sync-failure audit pinned to the failing booking, low-stock report flags on-hand <= reorderLevel, digest job never counted as `BACKUP_COMPLETED`, error-code presence, and a full automation pass writing zero cash transactions/inventory movements/payments/expenses/booking-cost rows - 23 checks green, full suite **902 passed / 0 failed**.

## Sprint 7 Features Completed

- **Report registry + filters:** `ReportService` (15 report definitions, envelope `{reportId, reportName, generatedAt, filters, payload}`, `REPORT_NOT_FOUND` for unknown ids) and `ReportFilterService` (month bounds, ISO normalization, default current-month range, `VALIDATION_ERROR` on inverted ranges).
- **Reports (backend):** `CashReportService` (R2 cashflow per account with transfer/opening separation, R15 daily cash reconciliation, R16 cash conversion), `SalesReportService` (R4 receivables with aging buckets CURRENT/1-30/31-60/61-90/90+, R5 revenue by service, R6 revenue by package), `ProfitReportService` (R3 income statement, R7 booking profitability, R8 expense breakdown PAID-only scope), `InventoryReportService` (R9 valuation with weighted-average + per-batch rounding, R10 movement ledger with running totals, R11 low stock with shortage), `OperationsReportService` (R12 equipment status/depreciation/maintenance, R13 partner commissions, R14 crew payments). Every money report carries a transaction-scope statement.
- **CSV export:** `ReportExportService` - `salikha-<reportId>-yyyy-mm-dd.csv`, RFC-4180 quoting, raw numbers, `TRUE`/`FALSE` booleans, formula-start cells (`= + - @ \t \r`) prefixed with `'`, `MAX_ROWS` 2000 truncation, exports audited exactly once; wired through `ReportController.exportReportCsv`.
- **Dashboard (R1):** `DashboardService.getDashboardData()` - money pulse from the ledger, booking pulse from BookingService, alerts (overdue receivables, low stock mirroring R11, unreconciled deployments), charts (30-day cash trend, 3-month revenue vs costs, top 5 packages); documented R1 payload validated.
- **Reports/UI wiring:** reports-page.html list with category groups, run cache (60s) with refresh, detail render, CSV export button, and empty/error/loading states; dashboard panels consume `getDashboardData`; both wired through `scripts.html` routing/activation (`window.REPORTS`).
- **Tests:** Sprint 7 sections 38-45 added - full suite **734 passed / 0 failed**, extended to **757/757** by the review-hardening pass below.

### Sprint 7 Review Hardening (backend; 2026-08-08, section 46)

- **Shared eligibility invariant:** reports (R3/R6/R7/R13) now use the same booking-eligibility filter as the dashboard revenue-vs-costs chart - CONFIRMED and later only; TENTATIVE/CANCELLED/DRAFT never leak revenue or costs.
- **R3 income statement:** per-booking revenue taken from `BookingCosts.revenueTotal` (net of discount) instead of item-snapshot math; odd-month day counts fixed (`DaysInMonth` undercounted August).
- **R6 revenue by package:** verified against `BookingCosts` (net of discount) incl. the `Unknown` package group and `avgPrice`.
- **R12 equipment status:** maintenance-due now considers only `MAINTENANCE`/`REPAIR` movements (assignments no longer reset the clock); never-maintained units are reported due.
- **R13 partner commissions:** cancelled bookings no longer generate report rows.
- **R15/R16 scope contracts:** `estimatedClosing` documented + posted-only pipeline with transfers/opening balances separated; R16 cash-in/cash-out pairing fixed; R2 income-statement cross-check no longer counts voided transactions as revenue.
- **Robustness:** report catalog registration decoupled from file load order; unbounded listing (`pageSize 0`) verified for inventory/equipment/commissions repos; R9 valuation covers every item in one batch read.
- **Checks added:** R6 net-price booking (3,700) + Unknown group via `BookingCosts`, R7 bucket-sums/totals/eligibility, R8 sharePct, R11 `LOW_STOCK_MULTIPLIER` toggle (shortage 15 -> 35 -> 15), R12 maintenance-due state machine with backdated row, dashboard revenue = R3 per month - 23 checks green, full suite **757 passed / 0 failed**.

### Sprint 7 Defects Fixed During Testing

- `ProfitReportService` R8 totals accumulator used keys `gross`/`net` while accumulating `grossAmount`/`taxAmount`/`netAmount`, producing `NaN` totals - now tracks the correct four keys.
- `ProfitReportService` referenced `ReportFilterService` at module scope; replaced with a call-time forwarder so the shared harness (alphabetical load order) evaluates cleanly.

## Sprint 6 Features Completed

- **Production prep (backend):** `TaskService`/`TaskRepository`/`ProductionService`/`ProductionController` - production tasks per booking, checklist completion, `READY_TO_DEPLOY` readiness gate, and automatic deployment creation.
- **Deployments (backend):** `DeploymentRepository`/`DeploymentService`/`DeploymentController` - `PLANNED -> LOADING -> IN_PROGRESS -> RETURNED -> RECONCILED -> CLOSED`; one deployment per booking; reconciliation validates crew sign-off and required checklist items, posts `STOCK_USAGE`/`STOCK_RETURN` inventory movements, computes `actualMaterialCost` at batch unit cost, and recalculates the booking `BookingCosts` snapshot. Idempotent/double-call-safe under the script lock.
- **Crew (backend):** `CrewRepository`/`CrewService`/`CrewController` - member master, assignments (role/hourly/flat pay snapshots), per-member sign-off, ledger-linked `EXPENSE` cash on pay (void restores cash). `EXPENSE` stored positive with `direction = 'OUTFLOW'`.
- **Partner commissions (backend):** `PartnerRepository`/`PartnerService`/`PartnerCommissionService`/`PartnerController` - partner registry, commissions per booking, `PENDING -> DUE -> PAID`, one idempotent ledger-linked `EXPENSE` transaction on settlement.
- **Ledger routing:** ledger voids of crew/commission transactions routed back to their workflows; `voidTransaction()` never hard-deletes.
- **Tests:** Sprint 6 sections added - full suite **507 passed / 0 failed**, covering the deployment manual scenario (load 10 / return 4 / consume 6), lifecycle cash-neutrality, paired ledger voids, and reconciliation double-call safety.
- **Production + Deployments UI:** `production-page.html`/`deployments-page.html`/`operations-scripts.html` - production register (bookings with per-booking task checklist, readiness gate, plan/complete/reopen/cancel tasks), deployments register (status filter, search, material-cost column), deployment workspace (materials with add/edit, equipment assign, checklist toggle + add, incidents log/resolve), full lifecycle actions (Start loading -> Depart -> Mark returned with per-item returned-quantity capture -> Reconcile with blocking confirm); wired into `index.html` includes + `scripts.html` routing/activation (`window.OPERATIONS`). Returned quantities are captured in the "Mark returned" modal because the backend only accepts them in `markDeploymentReturned` (no post-RETURNED edit path).

## Sprint 6 Review Hardening (backend; 2026-08-08)

- **Load availability guard:** materials cannot be added or updated with a loaded quantity above current on-hand (`DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY`); non-negative enforced.
- **Return validation:** per-item returned quantity is limited to 0..loaded (`DEPLOYMENT_RETURN_QTY_INVALID`); over-returns no longer corrupt consumed values.
- **Equipment integrity:** only `IN_SERVICE` equipment assignable (`EQUIPMENT_INVALID_STATUS_TRANSITION`); a unit cannot be assigned to two active deployments (`DEPLOYMENT_EQUIPMENT_ASSIGNED`); new `returnDeploymentEquipment` writes the return condition, restores the registry (IN_SERVICE + new condition), and rejects double returns.
- **Close flow:** close exists only from `RECONCILED` (`DEPLOYMENT_NOT_RECONCILED_CANNOT_CLOSE`), is double-close safe (`DEPLOYMENT_CLOSED`), sets `closed_at/closed_by`, and is audited as `DEPLOYMENT_CLOSED`.
- **Tests:** hardening sections 37b/37c added; full suite **535 passed / 0 failed**.

## Sprint 5 Features Completed (backend; shipped with this release)

- **Inventory (backend):** weighted-average valuation, costed batches, movement ledger (STOCK_IN / STOCK_USAGE / STOCK_RETURN / ADJUSTMENT / WRITE_OFF), hard negative-stock guard.
- **Purchasing (backend):** supplier master, PO lifecycle, line-level receipts creating costed batches, prorated landing cost.
- **Equipment (backend):** asset registry, capital-vs-operating classification, condition/status tracking, straight-line depreciation (report-only).
- **Schema:** `SheetSchemaService.SCHEMA_VERSION = '6.0.0'`; inventory/equipment/purchasing/suppliers sheets added by the initializer.

## Sprint 4 Features Completed

- **Expense lifecycle (backend):** `ExpenseRepository`/`ExpenseService`/`ExpenseController` - status machine DRAFT -> SUBMITTED -> APPROVED -> PAID with REJECTED -> DRAFT rework; only a PAID expense mints one VERIFIED EXPENSE cash outflow (negative netAmount) atomically with the status change; approval never moves cash; separation of duties (approver != payer); `getExpenseSummary`; filtered/paginated list (status, cost type, category, booking, account, date, search); voiding a PAID expense voids its linked ledger transaction; direct-cost tagging requires a booking when DIRECT.
- **Expenses UI:** `expenses-page.html`/`expenses-scripts.html` - summary cards (drafts, for approval, approved to pay, paid net, direct costs net), filtered + paginated register, status-driven actions (Submit/Approve/Reject/Pay/Void/Reopen), create/edit modal with live net preview and direct-booking picker, pay modal (account + payment method), detail modal with linked cash-transaction view.
- **Booking profitability (backend):** `BookingProfitService` - one `BookingCosts` snapshot per booking; direct buckets (material/transport/meals/crew/commission/other), gross, allocated operating cost, net, margin; allocation pool = PAID non-voided OPERATING expenses in event month x revenue share per `FINANCIAL_RULES.md` §12-13; `recalculateAllBookings()` + `recalculateForMonth(YYYY-MM)`; recompute on direct/operating pay-void and allocation-toggle change; read-only computed view when no snapshot exists.
- **Booking Profitability tab:** added to the booking-detail workspace with the full bucket breakdown, allocation note, and a Recalculate action wired to the relocated workspace (`data-bd-*` delegation fix).
- **Settings toggle:** `ALLOCATE_OPERATING_COSTS` (default TRUE) with `getAllocateOperatingCosts`/`setAllocateOperatingCosts`; audited; recomputes stored snapshots.
- **Tests:** sections 21-25 added (344/344 passing) covering the expense state machine, allocation fixtures, direct-cost profitability.

## Booking Features Completed

- Bookings with server-side pricing (package + add-ons + custom charges + transportation - discount), package/add-on snapshots, planned commission kept internal, estimated profitability.
- Validated status machine (INQUIRY/TENTATIVE/CONFIRMED/COMPLETED/CANCELLED/ARCHIVED; PREPARING/READY/IN_PROGRESS reserved) with per-transition status history.
- Cancellation preserving payments (refund review flagged; balance not auto-zeroed); archive/reactivate with reasons.
- Rescheduling with schedule history; schedule-conflict warnings with audited overrides; cancelled bookings excluded from conflicts.
- Booking list with search/filters/pagination, detail workspace with tabs, internal month calendar (no Google Calendar), dashboard booking pulse + attention items.
- Duplicate-submission protection via `idempotency_key`; cached-balance verification with optional repair.

## Payment and Receivable Features Completed

- Payments with idempotency keys: atomic posting of payment + allocation + one linked `BOOKING_PAYMENT` cash inflow; overpayment override confirmation; paired voids (payment + ledger); ledger-link verification.
- Receivables: server-computed payment status; effective paid from valid allocations minus refunds; receivables list with filters; client/booking summaries; cached-total refresh on every money event.
- Refunds: eligibility (payment minus refunds), amount limits, `REFUND` cash outflow, payment status transitions, paired voids.

## Financial Integration Result

- **Booking creation cash effect:** NONE (verified: zero cash transactions created).
- **Payment cash effect:** exactly one `BOOKING_PAYMENT` INFLOW per posted payment.
- **Payment-ledger linkage:** payment.cashTransactionId always set; verification function reports consistency.
- **Void result:** payment + linked cash transaction voided together; account balance restored.
- **Cached-balance verification:** 0 mismatches after the full scenario.

## Runtime Fix Deployed (2026-08-07)

- **Root cause:** `RepositoryService.getSpreadsheet()` called the non-existent `SpreadsheetApp.getSpreadsheetById(id)`; every database call failed with `CONFIGURATION_ERROR: The configured spreadsheet could not be accessed`.
- **Fix:** corrected to `SpreadsheetApp.openById(id)` (`src/RepositoryService.gs:35`).
- **Deployment:** `clasp push --force` (69 files, full Sprint 0-3 build) + new web-app deployment `@10`. URL:
  `https://script.google.com/macros/s/AKfycbz7y_-Fe2qeLNTf2UBnYE_XS6qCuPbNUxGsCvh9NYCUWDRsbP-ZQ8XARMf3dkGLfIZvaQ/exec`
- Existing versioned deployment URLs (`@9`, `@8`, ...) remain pinned to their old builds; only the `@HEAD` and `@10` URLs serve the fixed code.

## UI Layout Fix Deployed (2026-08-07)

- **Reported symptom:** "All the contents are in the bottom of the tabs" - every module page rendered below the fold.
- **Root cause:** `index.html` includes the module pages (Cashflow, Settings, Clients, Leads, Packages, Bookings, Payments, Calendar, booking detail) *after* the `.app` shell, which is `min-height: 100vh`; the pages existed as siblings below the shell and only appeared after scrolling past a full viewport-height empty block.
- **Fix:** `scripts.html` now relocates all module views and the booking-detail workspace into `#main-content` at bootstrap (`relocateModuleViews()`).
- **Verification:** local headless preview confirmed module views are inside `#main-content` and content starts directly under the topbar; navigation and page flow intact.
- **Deployment:** `clasp push --force` + new web-app deployment `@12`:
  `https://script.google.com/macros/s/AKfycbxODZSY4p24xDcYBibrSLmD54UnC3rWGvM4ihyr3Uelc0VDluJa5pkv4A8lJlDZnRtfww/exec`

## UI Layout Fix Hardened + Redeployed (2026-08-08)

- `relocateModuleViews()` no longer uses a hand-maintained view list: it relocates **every** `.view` / `.detail-workspace` element not already inside `#main-content`, so future module pages are automatically covered.
- **Verification:** jsdom runtime test - all 9 module views + booking-detail workspace render inside `#main-content`; navigation to all 19 routes resolves the correct active view; `.view[hidden]`/`.detail-workspace[hidden]` rules present.
- **Deployment:** `clasp push --force` (89 files) + new web-app deployment `@13`:
  `https://script.google.com/macros/s/AKfycbzXFkaJL2IvfnF3d_JnQh3gvE-95-TEfK6ladBlHPix9A9I4HKlmD-fKEG3qZKmBhDm4Q/exec`

## Tests Performed

- **Automated (757/757 pass):** `node test/sprint1-tests.js` - all Sprint 0-6 regressions plus Sprint 7 sections 38-46: report registry and date filters (15 reports, unknown-id rejection, inverted-range validation), R1-R16 fixtures (R2 account-ledger positions with in-range opening balances, R4 aging buckets, R5 shares ~100%, R9 valuation with per-batch rounding, R10 ledger running totals, R11 low stock + multiplier toggle, R12 depreciation/maintenance incl. maintenance-due state machine, R13 commissions incl. cancellation exclusion, R14 crew, R15 reconciliation differentials, R16 cash conversion incl. paired joins), scope statements on every money report, CSV export (filename scheme, quoting, formula-start protection, MAX_ROWS truncation, single audit entry), dashboard/booking pulse equivalence, and the section 46 review hardening (R6 BookingCosts net revenue + Unknown group + avgPrice, R7 bucket invariants, unbounded listings, dashboard months = R3).
- **Static checks:** all `.gs` files + embedded HTML JS pass `node --check`; JSON/JSONC valid; secret scan clean.
- **Manual scenario:** verified end-to-end (see below).
- **Apps Script runtime / browser tests:** NOT possible in this environment - require owner migration, authorization, deployment, and a logged-in browser session.

## Manual Scenario Result

Sprint 7 scenario:

| Step | Expected | Actual |
|---|---|---|
| Run every report (R1-R16) on the fixture data | structured envelope with rows/totals/summary + scope statement | PASS |
| Unknown report id | `REPORT_NOT_FOUND` structured error | PASS |
| R2 totals: rows sum, transfer neutrality, netMovement | matches ledger | PASS |
| R15: seed a zero-diff daily reconciliation | returned with difference 0 | PASS |
| R16: incomes/expenses only (transfers/opening excluded) | correct rows and totals | PASS |
| Export CSV from the controller | `salikha-<reportId>-yyyy-mm-dd.csv`, one audit entry | PASS |
| Dashboard pulse equals underlying reports | money from ledger; low-stock mirrors R11 | PASS |

Sprint 6 scenario:

| Step | Expected | Actual |
|---|---|---|
| Production readiness (all required tasks done + crew assigned) | deployment auto-created (PLANNED) | PASS |
| LOADING captures loaded quantities (10) | editable during LOADING only | PASS |
| IN_PROGRESS locks loaded quantities | blocked edits | PASS |
| RETURNED with crew sign-off + checklist complete | RETURNED | PASS |
| Reconcile: consumed = loaded - returned (10 - 4 = 6) | STOCK_USAGE 6 + STOCK_RETURN 4 posted | PASS |
| actualMaterialCost at batch unit cost; BookingCosts recalculated | snapshot updated | PASS |
| Crew payment mints one EXPENSE (ledger-linked) | cash outflow on chosen account | PASS |
| Commission PAID mints one EXPENSE | ledger-linked | PASS |
| Reconcile while checklist incomplete or crew unsigned | blocked | PASS |

## Manual Scenario Result

Sprint 4 scenario:

| Step | Expected | Actual |
|---|---|---|
| Draft expense 1,500 transportation (DIRECT, booking B) | no cash change | PASS |
| Submit + approve expense | no cash change | PASS |
| Pay expense from Cash on Hand | Cash -1,500; one VERIFIED EXPENSE outflow | PASS |
| BookingCosts costTransport = 1,500; gross/net recomputed | snapshot updated | PASS |
| Reject path: expense -> SUBMITTED -> REJECTED (reason) -> reopen to DRAFT | no cash change | PASS |
| Void a PAID expense | linked cash transaction voided; balance restored | PASS |
| Operating allocation pool (PAID operating in month) x revenue share | allocOpsCost per formula | PASS |
| Allocation toggle OFF -> snapshots recomputed, allocOpsCost = 0 | audited change | PASS |

## Sprint 4 Manual Scenario Result

| Step | Expected | Actual |
|---|---|---|
| Draft expense 1,500 transportation (DIRECT, booking B) | no cash change | PASS |
| Submit + approve expense | no cash change | PASS |
| Pay expense from Cash on Hand | Cash -1,500; one VERIFIED EXPENSE outflow | PASS |
| BookingCosts costTransport = 1,500; gross/net recomputed | snapshot updated | PASS |
| Reject path: expense -> SUBMITTED -> REJECTED (reason) -> reopen to DRAFT | no cash change | PASS |
| Void a PAID expense | linked cash transaction voided; balance restored | PASS |
| Operating allocation pool (PAID operating in month) x revenue share | allocOpsCost per formula | PASS |
| Allocation toggle OFF -> snapshots recomputed, allocOpsCost = 0 | audited change | PASS |

## Database Migration Result

- Sheets created: 32 total (20 prior + 12 Sprint 5/6: InventoryItems, InventoryBatches, InventoryMovements, Equipment, EquipmentMovements, Suppliers, Purchases, PurchaseItems, Crew, CrewAssignments, CrewPayments, Partners, PartnerCommissions).
- Schema version: 6.0.0 (metadata updated idempotently; initializer also ensures system categories and all sprint sheets).
- Migration result: PASS in the mock environment; real-spreadsheet migration pending owner action (`initializeDatabase()`).
- Conflicts found: none.

## Known Limitations

- Full role-based authorization still pending (temporary actor).
- Operating-cost allocation uses the documented revenue-share policy; only the monthly revenue pool is supported (no quarterly/calendar toggle).
- Deployment material operating cost feeds BookingCosts material bucket from RECONCILED onward; post-reconcile edits require an inventory adjustment (never edit the reconciled record).
- Refund posting follows FINANCIAL_RULES §9; there are no cancellation-specific auto-refund policies.
- Booking conflict detection covers date/time/equipment/crew overlaps only at booking level; crew and equipment resource conflicts at deployment level remain guarded by the Sprint 6 deployment safeguards.
- Reports/Dashboard UI is wired but not yet deployed; the backend is verified by the automated harness (757/0), including the review-hardening pass (section 46).
- Sprint 8 backend (Files, Calendar mirror, Backups, Digest, Notifications, Automation) is verified by the automated harness (902/0, sections 47-55). The Files and Automation UIs remain Sprint 0 placeholder pages (nav entries + disabled Files tab in booking detail); UI wiring and Google Calendar/Drive live integration remain deployment-pending.
- UI behaviors verified by code review + automated logic only until deployment.

## Owner Actions Required

1. `clasp push --force`, then redeploy the web app (version 0.9.0-documents-automation).
2. Confirm the database migration ran (`initializeDatabase()` - schema 7.0.0, no new sheets this sprint; Files + SyncLogs carry the Sprint 8 records).
3. Configure Script Properties for Sprint 8: `CALENDAR_ID`, `BACKUP_FOLDER_ID`, `OFF_SITE_BACKUP_FOLDER_ID` (see `docs/DEPLOYMENT_GUIDE.md`), then exercise Automation status in Settings.
4. Exercise the Reports page and Dashboard (Sprint 7 items) plus Files upload/trash, calendar sync on a test booking, `runBackupNow`, and a weekly digest send.
5. Confirm the Sprint 5/6 UI pages (Inventory, Equipment, Purchasing, Production, Deployments, Crew, Partners) still render and function after the new includes.
6. Do not invent real client, booking, or inventory data.

## Readiness for Sprint 8

Sprint 8 backend is complete and harness-green (902/902); the sprint is fully ready pending the owner deployment + review above (schema 7.0.0, Script Properties for Calendar/Backup folders, and UI exercise).

## Recommended Next Action

Match the owner to a Sprint 7 review + web-app redeployment; meanwhile schedule the Sprint 5/6 UI review, then start Sprint 8 (documents and automation).

## Cross-References

- Sprint scope: `docs/IMPLEMENTATION_PLAN.md` Sprints 7-8
- Verification: `docs/TESTING_CHECKLIST.md` (S7 results recorded)
- Report contracts: `docs/REPORT_DEFINITIONS.md` (R1-R16)
- Data contract: `docs/DATABASE_SCHEMA.md` (schema 6.0.0)
- Money rules: `docs/FINANCIAL_RULES.md` (§3, §14, §17)
- Workflows: `docs/BUSINESS_WORKFLOWS.md` (WF-13, WF-14)
- How to work: `AGENTS.md`
