# CHANGELOG

> Version history for Salikha Studio OS. Conventional changelog format.
> Versioning: `MAJOR.MINOR.PATCH[-suffix]`. Current: `0.9.1-sprint9`.

## Legend

| Section | Meaning |
|---|---|
| Added | New capability |
| Changed | Modified behavior |
| Fixed | Bug correction |
| Security | Security fix |
| Documentation | Docs-only change |

---

### Added (First-run system setup flow, backend + frontend; 2026-08-09)

- **`SystemInitializationService.gs`** - setup orchestrator. `getSetupStatus()` is read-only (never mutates, writes no audit rows); `runInitialization(actor)` runs the 10-step sequence (account, database, catalog/schema, drive, calendar, health, automation triggers, backup, security snapshot, audit finalization). Every step maps through `okStep(key, opts)`/`failStep(key, code, fallback)`; a failed step stops the run and reports structured step results instead of throwing. The `SYSTEM_INITIALIZED` script-property marker is persisted only when all steps succeed; re-runs are idempotent (trigger install and backup folder creation reuse existing resources, calendar/schema warnings are non-blocking) and the whole flow never creates data rows, cash transactions, or audit noise beyond its own setup entries.
- **`SetupController.gs` + `SetupPermissionService.gs`** - server entry points `getSetupStatus` / `initializeSalikhaStudioOS` wrapped in the standard envelope; OWNER/ADMIN gate with the documented temporary no-role boundary (`docs/SECURITY_MODEL.md` §2.1), non-OWNER/ADMIN roles rejected with `SETUP_PERMISSION_DENIED`.
- **New error codes** in `ErrorService` (`DATABASE_NOT_CONFIGURED`, `DRIVE_NOT_CONFIGURED`, `AUTHORIZATION_REQUIRED`, `USER_NOT_REGISTERED`, `SETUP_PERMISSION_DENIED`, `AUTOMATION_SETUP_FAILED`, `SYSTEM_HEALTH_FAILED`, `DATABASE_INITIALIZATION_FAILED`) and new audit actions in `AuditService` (`SYSTEM_SETUP_STARTED`, `SYSTEM_SETUP_COMPLETED`, `SYSTEM_SETUP_FAILED`, `SYSTEM_SETUP_STEP`, `SYSTEM_SETUP_SECURITY`; security snapshot audited on full runs only).
- **`BackupService.ensureBackupStructure()`** - Drive-only, idempotent readiness probe for the backup folder tree; the setup backup step must not depend on `SpreadsheetApp` (null in a standalone web app), so it verifies folder reachability instead of running a full backup.
- **Frontend boot gate:** `index.html` + `scripts.html` now call `getSetupStatus()` on load; an uninitialized app routes to the new `#/setup` page (never to the shell), an initialized app routes away from `#/setup`.
- **Setup page:** `src/setup-page.html` + `setup-scripts.html` - step list with status/error rendering, signed-in user display, initialize button (hidden when already ready), `window.SETUP = { activate, refresh, isInitialized }` with single-binding guard.
- **Tests:** Sprint 9 section 57 added to the harness (status-only reads audit nothing, denied-role handling, full-run success + marker + readiness + idempotent re-run, denied init keeps the existing marker, controller envelopes); full suite now **942 passed / 0 failed**. Deployment of the new page pending owner.

---

- The "Initialize database" action was only reachable on the Cashflow page, while the Settings page banner instructed users to run it there. The Business Database card now shows an **Initialize database** button whenever the schema needs initialization (`CONNECTED_BUT_NOT_INITIALIZED` / `NEEDS_INITIALIZATION`), calling the same server function as Cashflow and refreshing integration status on success. Setup-instructions modal updated to point to the Settings button.
- Deployed as **@17** (version 17).

---

### Added (Purchasing module completion, backend + frontend; 2026-08-09)

- **`PurchaseService.getPageData(filters)`** - single-request page model for the Purchasing screen: status-count summary, supplier summary, paginated purchase rows enriched with supplier name + line count + ordered/received totals + progress percentage, and inventory-item + supplier lookups for the create-purchase modal. One full read of `Purchases`, one full read of `PurchaseItems`, one full read of `Suppliers`, one full read of `InventoryItems`. Replaces the placeholder route and the per-row N+1 lookup pattern.
- **`PurchaseService.getDetailView(purchaseId)`** - purchase + lines + receipt history derived from `InventoryMovements` (source = `PO_RECEIPT`). Powers the detail workspace on the Purchasing page.
- **`PurchaseService.aggregateSuppliers(filters)`** - supplier panel: per-supplier `purchaseCount` + `lastPurchaseDate` aggregated from one full read of `Purchases` (no per-supplier queries).
- **`PurchasePermissionService.gs`** - capability matrix for the Purchasing module (OWNER/ADMIN/OPERATIONS write; FINANCE/CREW/VIEWER read-only); actors without a role are allowed under the documented temporary boundary (`docs/SECURITY_MODEL.md §2.1`).
- **`PurchaseController.getPurchasingPageData` / `getPurchaseDetailView` / `getSupplierPanel`** - server entry points exposed via `google.script.run`; every mutation entry point guarded by `guardPurchasingWrite()`.
- **Frontend Purchasing page:** `src/purchasing-page.html` (summary KPIs, supplier panel, purchase list with search/status/supplier/sort filters and pagination, detail workspace, empty state, mobile-friendly cards); `src/purchasing-components.html` (row + detail + form + receive-modal templates); `src/purchasing-scripts.html` (`window.PURCHASING.activate()` and helpers; debounced search; consolidated page-data fetch; targeted detail fetch; one google.script.run per action; code-aware safe errors via `toastMessageFromResponse`); wired into `src/scripts.html` and `src/index.html` so the sidebar nav now opens a real page instead of the placeholder.
- **`receivePurchase` strict over-receipt guard:** explicit `wantQty > available` now throws `PURCHASE_RECEIVED_EXCEEDS_QTY` (silent cap removed); the `-1` "fill remaining" sentinel is still honoured for full receipts.
- **Tests:** harness section 58 added (37 new checks): page-data single request, supplier panel aggregation, manual fixture 100 paper @ 10 + 50 magnet @ 5 = 1,250, partial receipt 60/20 -> `PARTIALLY_RECEIVED`, final receipt 40/30 -> `RECEIVED`, over-receipt rejected, idempotent retry rejected, no cash change on receipt, no expense created for the PO, audit actions recorded (`SUPPLIER_CREATED`, `PURCHASE_CREATED`, `PURCHASE_ORDERED`, `PURCHASE_RECEIVED`), existing Sprint 5 fixture regression still green. Full suite **979 passed / 0 failed**. **Owner verification PASSED on the deployed web app 2026-08-09 - Purchasing module FULLY FUNCTIONAL** (supplier create -> PO draft -> edit -> place order -> partial receipt -> second receipt -> RECEIVED, with idempotency, over-receipt rejection, no-cash-on-receipt, and audit trail all confirmed at runtime).

---

- **Movement ledger truthfulness:** `InventoryMovementService.recordStockIn` / `recordStockReturn` / `recordUsage` now return the **real** `movementId` produced by `appendMovement`; previously the three return paths generated an `IdService.generateId('MV')` after the row was appended, leaving the call site with an ID that was never written to the sheet. Audit entries now follow the actual stored id, so traceability (the audit row's `entityId` and the movement row's `movement_id`) always agree.
- **Single-read list efficiency:** `InventoryService.listItems` now reads the `InventoryBatches` sheet **once** and groups batches in memory by `item_id`, instead of issuing a full-sheet read per item. The fixture of two items drops from N+1 reads to 2 reads per request, matching the per-module performance contract (`docs/PRODUCT_REQUIREMENTS.md NFR` - "use batch reads; avoid unnecessary full-sheet reads").
- **Page model + item detail view:** `InventoryService.getPageData(filters)` returns the summary KPI totals + enriched status-coloured rows + lookups in a single request; `InventoryService.getItemDetailView(itemId)` returns item + balance + batches + the last 50 movements in one request. Both are exposed through `InventoryController.getInventoryPageData` / `getInventoryItemDetailView` and are the entry points the Inventory page will use when the UI lands.
- **ADJUSTMENT outbound path:** `InventoryMovementService.recordUsage` now accepts `movementType: ADJUSTMENT` in addition to `STOCK_USAGE` and `WRITE_OFF`, mapping each to its own audit action (`STOCK_USAGE_RECORDED` / `STOCK_WRITE_OFF_RECORDED` / `STOCK_ADJUSTMENT_RECORDED`). The existing `recordStockAdjustment` controller still defaults to `STOCK_USAGE` for backwards compatibility with the S5 fixture, so no regression.
- **Opening stock entry point:** `InventoryService.recordOpeningStock(payload)` is the supported entry for the very first stock entry of an item (owner's existing stock). It routes through `recordStockIn` with `source: SOURCE_OPENING` and writes a distinct `OPENING_STOCK_RECORDED` audit row; the movement type remains `STOCK_IN` so valuation and batch math are unchanged.
- **`InventoryPermissionService.gs`:** new capability service for the Inventory module. Posture matches `FilePermissionService` / `ReportPermissionService` - actors without a role are allowed (documented temporary boundary, `docs/SECURITY_MODEL.md §2.1`), explicit roles (when present) follow the matrix (OWNER/ADMIN/OPERATIONS write; FINANCE/CREW/VIEWER read-only). `InventoryController` guards every mutation entry point through `guardInventoryWrite()`.
- **Controller coverage:** `InventoryController` now exposes `getInventoryPageData`, `getInventoryItemDetailView`, `recordOpeningStock`, and `recordStockWriteOff` alongside the existing item CRUD and movement entry points; the new endpoints are the single source for the future Inventory page and for owner-runtime verification.
- **Tests:** full suite **942 passed / 0 failed** (Sprint 9 hardening section 56 + setup section 57 already included; no new failures from the inventory rework). Deployment of the controller changes pending owner.

---

- Pushed 134 files to the Apps Script project (`clasp push --force`), created version 15, and deployed web app **@15 "Production - Sprint 9 mobile"** - live at `https://script.google.com/macros/s/AKfycbxs99ahdIyKqFOoufvYYCMhtGYv6qxNUALMWTKazN0VBx9TEcmQETshj1Dr12Oxr3qWCg/exec`. Rollback: redeploy version 14. Owner steps remaining: re-authorize scopes on first open, run Settings > Check Connections, then the S9-3/S9-4/S9-5 runtime pass.

---

### Changed (Sprint 9 mobile usability pass, frontend; 2026-08-08)

- **Touch targets:** buttons, icon buttons, and form inputs grow to 44px on screens ≤ 640px (DESIGN_SYSTEM §23); nav items and table rows get larger tap areas; inputs/selects/textarea switch to 16px font on small screens so iOS never auto-zooms on focus.
- **Bottom-sheet modals:** on ≤ 640px, modals slide to the bottom edge (full width, rounded top corners, max-height 92dvh) with a sticky footer bar that respects `env(safe-area-inset-bottom)` - payment entry, deployment forms, and reconciliation sheets are now one-thumb friendly.
- **Sticky bottom action bar:** `.section-actions` on small screens moves out of the section header (small JS promotion on navigation, `scripts.html ensureMobileActionBars`) to the bottom edge of the view and sticks while the page scrolls, so money-flow primaries (Record Transaction, Verify, Approve, Reconcile) stay reachable without scrolling back up.
- **Touch scroll behavior:** `.table-wrap` gets momentum scrolling (`-webkit-overflow-scrolling: touch`) and contained horizontal overscroll so wide data tables no longer hijack page scrolling on phones.
- **No sticky hover on touch:** under `(hover: none)`, hover tints on nav items, buttons, table rows, context/report items, and calendar events are disabled so taps never leave a stuck highlight.
- **Toasts:** centered, full-width strip at the top on mobile instead of the desktop top-right corner.
- **Tests:** full suite still **909 passed / 0 failed** (server tests unaffected; UI changes are static).

---

- **Files module unlocked for the owner in production:** `FileController` resolves the actor from the session (`AuditService.getActor()` - `{ userId, name }`, no role), but `FilePermissionService.canUpload/canTrash/canRead` returned `false` for any actor without a role, so *every* upload/list/trash over the real server path failed with `FILE_PERMISSION_DENIED` - including the owner's (the harness only passed because tests supply explicit role-bearing actors like `s8OwnerActor`). Per the documented temporary boundary (`docs/SECURITY_MODEL.md` §2.1 - the auth gate arrives with the Users sheet), actors without a role are now **allowed** while the role matrix stays prepared; explicit roles (when present) are still enforced exactly as before (`VIEWER` cannot upload, `OPERATIONS` cannot upload EXPENSE, non-OWNER/ADMIN cannot trash).
- **Ledger parity check:** new harness assertions verify the dashboard money pulse and the account balance cache equal the ledger total (non-voided transactions), so no future refactor can silently drift money figures from the source of truth.
- **Tests:** Sprint 9 hardening section 56 added to the harness (session-shaped actor file upload/list/trash, role-matrix regression, dashboard-ledger parity); full suite now **909 passed / 0 failed**.

---

### Fixed (Sprint 6 review hardening, backend)

- **Deployment materials:** loaded quantities are now checked against available on-hand stock at add and update (new `DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY`), so a deployment can never plan/load more material than physically exists; negative quantities rejected with `VALIDATION_ERROR`.
- **Return reconciliation:** returned quantities are validated per item against the loaded quantity (new `DEPLOYMENT_RETURN_QTY_INVALID`); previously an over-return silently produced a negative consumed value.
- **Equipment assignment:** only `IN_SERVICE` equipment can be assigned (new `EQUIPMENT_INVALID_STATUS_TRANSITION` gate) and the same unit can no longer be assigned to two active deployments at once (new `DEPLOYMENT_EQUIPMENT_ASSIGNED`; released assignments on `RECONCILED`/`CLOSED` deployments only). Added the missing WF-5 equipment-return path (`returnDeploymentEquipment`): captures return condition on the `DeploymentEquipment` row, posts a RETURN movement to the equipment registry (status back to `IN_SERVICE`, condition updated), and rejects double returns (`DEPLOYMENT_EQUIPMENT_ALREADY_RETURNED`).
- **Close flow (WF-5):** `PLANNED/LOADING/IN_PROGRESS/RETURNED -> CLOSED` is now blocked (`DEPLOYMENT_NOT_RECONCILED_CANNOT_CLOSE`) and double closes rejected (`DEPLOYMENT_CLOSED`); closing writes `DEPLOYMENT_CLOSED` and `closed_at/closed_by`.
- **Tests:** review-hardening sections 37b/37c added to the harness; full suite now **535 passed / 0 failed**.

---

### Fixed (Sprint 7 review hardening, backend)

- **Income statement (R3) net revenue:** the report was priced from booking item snapshots (`subtotal - discount`), ignoring add-on/custom lines whose price changed after the snapshot; the per-booking total now comes from `BookingCosts.revenueTotal` (net of discount), so cost-bucket recomputes can never diverge from the income statement. Revenue and cost buckets now also apply the same booking-eligibility filter as the dashboard's revenue-vs-costs chart (CONFIRMED and later; TENTATIVE/CANCELLED excluded).
- **Income statement (R3) days-in-month:** `DaysInMonth` undercounted odd-month days (e.g., August returned 30), shifting monthly guestimate allocations; membership now uses the real month-boundary count.
- **Partner commission report (R13):** booking eligibility was ignored, so cancelled bookings still generated reported revenue and commission rows; eligibility and paid-expense checks are now applied.
- **Equipment status (R12) maintenance due:** the due flag was computed over all movement rows (assignments and returns reset the clock); it now considers only `MAINTENANCE`/`REPAIR` rows, and a unit with **no** maintenance ever is reported as due.
- **R2 ping/open/dashboard:** the R2 income statement cross-check no longer counts voided transactions as revenue.
- **Daily reconciliation (R15) `estimatedClosing`:** the method was renamed to match the report contract (`estimated-closing` scope, posted-only, transfers/opening balances separated); the report's opening-balance handling verified against the ledger.
- **Cash conversion (R16):** the pairing of cash in/out query keys was corrected so the five supplementary cash-flow lines in `REPORT_DEFINITIONS.md §17` agree with the ledger.
- **Report catalog filtering:** plugin registration no longer depends on source-file load order (`R2`/`R4`/`R6`/`R10`/`R11` forwarding), removing a fragile dependency in shared-harness and deployment contexts.
- **Tests:** review-hardening section 46 added to the harness (R6 net-of-discount revenue from BookingCosts incl. an `Unknown` package group, R7 bucket-sum/totals/eligibility invariants, R8 share-Pct, R9 unbounded listing, R11 multiplier restore, R12 maintenance-due state machine, dashboard-to-R3 month equality); full suite now **757 passed / 0 failed**.

---

## [0.8.0-reports-analytics] - 2026-08-08

### Added (Sprint 7 - Reports, Dashboard, Analytics, and CSV export, backend + UI)

- **Report suite (R1-R16):** `ReportService` registry + `ReportFilterService` (month bounds, ISO date normalization, default current-month range) + per-domain services: `CashReportService` (R2 cashflow per account, R15 daily reconciliations, R16 cash conversion), `SalesReportService` (R4 receivables with aging buckets, R5 revenue by service, R6 revenue by package), `ProfitReportService` (R3 income statement, R7 booking profitability, R8 expense breakdown with PAID-only scope), `InventoryReportService` (R9 valuation incl. weighted-average + per-batch rounding, R10 movement ledger with running totals, R11 low stock with shortage), `OperationsReportService` (R12 equipment status/depreciation/maintenance, R13 partner commissions, R14 crew payments). Every money report carries a transaction-scope statement; unknown report ids return `REPORT_NOT_FOUND`.
- **CSV export:** `ReportExportService` with `salikha-<reportId>-yyyy-mm-dd.csv` filename scheme, RFC-4180 quoting, raw numbers, `TRUE`/`FALSE` booleans, formula-start cells (`= + - @ \t \r`) prefixed with `'` to neutralize injection, `MAX_ROWS` 2000 truncation, exported rows audited exactly once; wired through `ReportController.exportReportCsv`.
- **Dashboard (R1):** `DashboardService.getDashboardData()` returning money pulse from the ledger, booking pulse from BookingService, low-stock / overdue / unreconciled-deployment alerts, and charts (30-day cash trend, 3-month revenue vs costs, top 5 packages); Reports page + dashboard panels wired into the SPA with loading/empty/error states.
- **Tests:** Sprint 7 sections 38-45 in `test/sprint1-tests.js`; full suite now **757 passed / 0 failed** (review hardening section 46 added later the same day).

### Fixed

- `ProfitReportService` R8 totals accumulator used keys `gross`/`net` while accumulating `grossAmount`/`taxAmount`/`netAmount`, producing `NaN` totals that collapsed to zero after rounding; the accumulator now tracks the correct keys.
- Report load-order fragility: `ProfitReportService` referenced `ReportFilterService` at module scope, which breaks in the shared harness (alphabetical load order); replaced with a call-time forwarder.

### Changed (Sprint 5/9 inventory hardening, backend; 2026-08-09)

- All report data remains backend-computed; the frontend only renders. No schema changes in this sprint.

---

### Fixed (Sprint 8 review hardening, backend)

- **Digest recipient normalization:** `setDigestRecipients` canonicalizes the stored list to trimmed comma-joined form (no spaces), and the weekly digest audit entry no longer capitalizes the summary, so the "no email bodies in audit" contract matches the DigestService message exactly.
- **Calendar sync eligibility split:** a booking whose status is eligible for mirroring but that has no event date now records `CALENDAR_SYNC_FAILED` (FAILED, never throws) instead of being skipped, while SKIPPED is reserved for status-ineligible bookings only.
- **Calendar event removal idempotency:** `removeBookingEvent` no longer fails when the mapping exists but the external event is already gone - it records SKIPPED and returns normally.
- **Calendar sync source constant:** `CalendarSyncService` referenced `BookingRepository.SHEET_BOOKINGS` (which does not export that constant), breaking the sync at runtime under alphabetical load order; it now resolves the sheet via `SheetSchemaService.SHEET_BOOKINGS`.
- **Validation helper fixes:** `DigestService`, `AutomationController`, and `NotificationService` called a non-existent `ValidationService.isValidEmail` / `SetupService.isInitialized`; they now use `ValidationService.isEmail(value, 'recipient').valid` and `DatabaseService.isInitialized()` respectively.
- **SyncLog ordering:** `listRecent` now sorts by `synced_at` descending with a row-index tiebreak, so recent entries are never hidden by same-second writes.
- **Timer handlers return values:** `automationDailyBackup`, `automationWeeklyOffsite`, `automationBackupVerification`, and `automationWeeklyDigest` now return the `runJob` result instead of `undefined`.
- **Backup failure envelope:** `runBackupNow` returns a `success:false` response with `error.code === 'BACKUP_FAILED'` when the job fails (previously a `success:true` envelope carrying `ok:false`), and `createBackup` maps an unopenable workbook file to `BACKUP_FAILED` deterministically.
- **Restore drill:** the drill's SyncLog/audit writes now target a schema-initialized test workbook (the harness seeds it before the drill), fixing the `Required sheet "AuditLogs" does not exist` crash; CSV exports gained `getDataRange()` mock coverage so `exportAllSheetsCsv` produces files in tests.
- **Tests:** Sprint 8 sections 47-54 added to the harness (Files, Drive folder safety, Calendar mirror, SyncLogs, digest, automation/backup, notifications, no-secrets); full suite now **879 passed / 0 failed**.

### Fixed (Sprint 8 review hardening, backend; 2026-08-08)

- **Calendar failure auditing:** failed calendar syncs recorded a SyncLog row but no audit entry, and the required `CALENDAR_SYNC_FAILED` action did not exist. The audit leaves now write `CALENDAR_SYNC_FAILED` (WARNING) for the no-event-date FAILED path, `syncBooking` exceptions, and `removeBookingEvent` failures.
- **Job-level audit attribution:** `runJob` audited every job with `BACKUP_COMPLETED`/`BACKUP_FAILED`, so the weekly digest job was recorded as a backup. Digest jobs now audit `DIGEST_SENT`/`DIGEST_FAILED` and record SyncLog failures under `EMAIL`, never `BACKUP_*`.
- **Low-stock alert audit:** the digest's low-stock section fired without an audit trail; the new `LOW_STOCK_ALERT_SENT` action records each digest that carries a low-stock section.
- **Error-code contract:** `CALENDAR_PERMISSION_DENIED` added to `ErrorService.CODES` (message + code value) to complete the documented Sprint 8 code set.
- **Tests:** review-hardening section 55 added to the harness (reschedule keeps the same mirrored event with no twin, `CALENDAR_SYNC_FAILED` audit pinned to the failing booking, low-stock alert audited when the digest fires, digest job never counted as `BACKUP_COMPLETED`, error-code presence, and a full automation pass writing zero cash transactions/inventory movements/payments/expenses/booking-cost rows); full suite now **902 passed / 0 failed**.

---

## [Unreleased]

### Added

- Initial project documentation
- Apps Script application foundation
- Responsive application shell
- Development utilities

### Fixed (web app deployment)

- Fixed the UI layout bug where every module page (Cashflow, Settings, Clients, Leads, Packages, Bookings, Calendar, Payments, booking detail) rendered **below the fold** ("contents at the bottom"), because `index.html` includes those pages after the `.app` shell, which is `min-height: 100vh`. `scripts.html` now relocates all module views and the booking-detail workspace into `#main-content` at bootstrap so page content flows directly under the topbar. Pushed and deployed as web-app version `@12`.
- Hardened the layout relocation (`scripts.html` `relocateModuleViews()`): instead of a hand-maintained view list, it now relocates **every** `.view` / `.detail-workspace` element not already inside `#main-content`. Future module pages are automatically covered with no wiring change. Runtime-verified with jsdom: all 9 module views + booking detail render inside `#main-content`, and navigation to every route resolves the correct active view.
- Fixed the runtime spreadsheet connection failure (`The configured spreadsheet could not be accessed`): `RepositoryService.getSpreadsheet()` used the non-existent `SpreadsheetApp.getSpreadsheetById(id)` — corrected to `SpreadsheetApp.openById(id)`. Pushed all `src/` files and deployed a new web-app version (`@10`).
- Repaired the live Apps Script project (`Script function not found: doGet`): pushed all `src/` files with `clasp push --force` (the earlier push never landed the code; the deployment was created against an empty project).
- Restored `src/appsscript.json` timezone to `Asia/Manila` (it had been overwritten to `America/New_York` by a stray `clasp pull` in the project directory).
- Removed duplicate `.js` artifacts pulled into `src/` by that stray pull.
- Created versions 2-3; redeployed the "Sprint 0" web app deployment to version 2 and added a new deployment at version 3.
- Runtime-verified once: the deployment URL returned HTTP 200 with the fully rendered application shell. Subsequent anonymous fetches returned Google's Drive "file not found" page (macro-router propagation; owner must confirm in a logged-in browser session).

---

## [0.7.0-event-deployments] - 2026-08-08

### Added (Sprint 6 - Event Production, Deployments, Crew, Partners, backend)

- **Production prep (backend):** `TaskService`/`TaskRepository`/`ProductionService`/`ProductionController` - production tasks per booking grouped by booking, checklist-style completion, readiness computation (`READY_TO_DEPLOY` gate), and automatic deployment creation when a booking reaches production readiness.
- **Deployments (backend):** `DeploymentRepository`/`DeploymentService`/`DeploymentController` - `PLANNED -> LOADING -> IN_PROGRESS -> RETURNED -> RECONCILED -> CLOSED` lifecycle with one deployment per booking; loading captures loaded quantities; reconciliation computes `consumed = loaded - returned`, validates crew sign-off and required checklist items, posts inventory `STOCK_USAGE`/`STOCK_RETURN` movements, computes `actualMaterialCost` from batch unit costs, and recalculates the booking's `BookingCosts` snapshot. Reconcile is double-call-safe (idempotent under the script lock).
- **Crew (backend):** `CrewRepository`/`CrewService`/`CrewController` - crew member master, assignments to bookings/deployments with role/hourly/flat pay snapshots, per-member sign-off (`signedOff`) required before a deployment can reconcile, and crew payments that mint exactly one idempotent, ledger-linked `EXPENSE` cash transaction on pay (void restores cash via paired ledger void). `EXPENSE` amounts stored positive with `direction = 'OUTFLOW'`.
- **Partner commissions (backend):** `PartnerRepository`/`PartnerService`/`PartnerCommissionService`/`PartnerController` - partner registry (REFERRAL/SUB_CONTRACTOR/VENUE/OTHER), commission records per booking created at confirmation, `PENDING -> DUE -> PAID` settlement that mints one idempotent, ledger-linked `EXPENSE` cash transaction with counterparty `PARTNER`.
- **Ledger routing:** `CashTransactionService` routes a ledger void of a crew/commission transaction back to the originating workflow (`CREW_PAYMENT_VOID_REQUIRED` / `COMMISSION_VOID_REQUIRED`); `voidTransaction()` never hard-deletes.
- **Tests:** Sprint 6 sections added to the harness - full suite now **507 passed / 0 failed**, covering the manual deployment scenario (load 10, return 4, consume 6), cash-neutrality inside lifecycle flows, paired ledger voids, and reconciliation double-call safety.
- **Docs:** `DATABASE_SCHEMA.md` schema stays at 6.0.0 (Sprint 5 sheets); `IMPLEMENTATION_PLAN.md`, `TESTING_CHECKLIST.md`, `PROJECT_STATUS.md` updated to Sprint 6 state.
- **Production + Deployments UI:** `production-page.html`/`deployments-page.html`/`operations-scripts.html` - production register with per-booking task checklist, readiness gate (`markReadyToDeploy`), deployments register (status filter + search), deployment workspace (materials add/edit, equipment assign, checklist toggle + add, incidents log/resolve), lifecycle actions Start loading -> Depart -> Mark returned -> Reconcile (blocking confirm). Returned quantities are captured in the "Mark returned" modal (`returnedQuantities` payload) since the backend exposes no post-RETURNED edit path. Wired into `index.html` includes and `scripts.html` routing via `window.OPERATIONS`; no backend changes.

### Changed

- Version bumped to `0.7.0-event-deployments`.
- `DeploymentService.validateCrewSignoff` now accepts both camelCase and snake_case public records (`signedOff`/`crewAssignId` vs `signed_off`/`crew_assign_id`).

---

## [0.6.0-inventory-equipment] - 2026-08-08

### Added (Sprint 5 - Inventory, Purchasing, Equipment, backend)

- **Inventory (backend):** `InventoryRepository`/`InventoryService`/`InventoryMovementService`/`InventoryValuationService`/`InventoryController` - item master, costed batches, movement ledger (`STOCK_IN`, `STOCK_USAGE`, `STOCK_RETURN`, `ADJUSTMENT`, `WRITE_OFF`), weighted-average valuation per `FINANCIAL_RULES.md`, and a hard guard preventing negative on-hand quantities.
- **Purchasing (backend):** `SupplierRepository`/`SupplierService`/`PurchaseRepository`/`PurchaseService`/`PurchaseController` - supplier master, purchase-order lifecycle (`DRAFT -> ORDERED -> PARTIAL_RECEIVED -> RECEIVED -> CANCELLED`), line-level receive that creates a costed batch per received line, prorated landing cost.
- **Equipment (backend):** `EquipmentRepository`/`EquipmentService`/`EquipmentController` - asset registry (capital purchase recorded as capital, never operating expense), condition/status tracking, straight-line depreciation calculation for reports.
- **Tests:** Sprint 5 sections added to the harness - weighted-average fixture and negative-stock guard verified.
- **Schema:** `SheetSchemaService.SCHEMA_VERSION = '6.0.0'`; inventory/equipment/purchasing/suppliers sheets added by the database initializer.

### Changed

- Schema version moved 6.0.0; `DATABASE_SCHEMA.md` inventory/equipment/purchase sheets and ID prefixes documented.

---

## [0.5.0-expenses-profitability-ui] - 2026-08-08

### Added (Sprint 4 - Expenses and Profitability, backend + UI)

- **Expense lifecycle (backend):** `ExpenseRepository`/`ExpenseService`/`ExpenseController` - DRAFT -> SUBMITTED -> APPROVED -> PAID state machine (REJECTED -> DRAFT rework); only a PAID expense mints exactly one VERIFIED EXPENSE cash outflow (negative netAmount) atomically with the status change; approval never moves cash; separation of duties (approver != payer); `getExpenseSummary`; filtered/paginated list; voids an approved expense together with its linked ledger transaction; direct-cost tagging with booking required.
- **Booking profitability (backend):** `BookingProfitService` - one `BookingCosts` snapshot per booking; direct buckets (material/transport/meals/crew/commission/other), gross, allocated operating cost, net, and margin per `FINANCIAL_RULES.md` §13; allocation = PAID operating expenses in month x revenue share; `recalculateAllBookings()` and `recalculateForMonth(YYYY-MM)`; recompute on direct/operating expense pay-void and on the allocation toggle; read-only computed view when no snapshot exists.
- **Settings toggle:** `ALLOCATE_OPERATING_COSTS` (default TRUE) with `getAllocateOperatingCosts`/`setAllocateOperatingCosts`; toggle in the Settings page is audited and recomputes every stored snapshot.
- **Expenses UI:** `expenses-page.html`/`expenses-scripts.html` - summary cards (drafts, for approval, approved to pay, paid net, direct costs net), filtered + paginated register, status-driven actions (Submit/Approve/Reject/Pay/Void/Reopen), create/edit modal with live net preview and direct-booking picker, pay modal (account + payment method), detail modal with linked cash-transaction view.
- **Booking Profitability tab:** added to the booking-detail workspace with the full bucket breakdown, allocation note, and a Recalculate action.
- **Tests:** sections 21-25 added to the harness (344/344 total, all passing) covering the expense state machine, allocation fixtures, and the direct-cost profitability scenario.
- **Shell wiring:** `scripts.html` routes the expenses view; `index.html` includes the new pages.

### Fixed

- **Booking detail action delegation:** `data-bd-*` buttons (pay/edit/reschedule/cancel and the new recalculate) were unreachable because `booking-detail-workspace` is relocated out of `view-bookings`; `activate()` now binds the click handler to the workspace too.

### Changed

- Version bumped to `0.5.0-expenses-profitability-ui`.
- `DATABASE_SCHEMA.md`: expenses/profitability/allocation documented; `BKC` booking-cost ID prefix added (schema stays 3.0.0).

---

## [0.4.0-bookings-receivables] - 2026-08-07

### Added (Sprint 3 - Bookings and Receivables)

- **Schema 3.0.0:** 7 new sheets (Bookings, BookingItems, BookingStatusHistory, BookingScheduleHistory, Payments, PaymentAllocations, Refunds); new cash transaction types `BOOKING_PAYMENT` (INFLOW) and `REFUND` (OUTFLOW); system categories "Client Booking Payment" (INCOME) and "Client Refund" (REFUND) seeded idempotently for existing databases; `idempotency_key` on Bookings.
- **Bookings:** `BookingRepository`/`BookingService` - create/update with server-side pricing, package/add-on snapshots, custom charges, transportation, discounts (FIXED/PERCENTAGE, applied once, never negative totals), planned commission kept internal, estimated profitability; validated status machine (INQUIRY/TENTATIVE/CONFIRMED/COMPLETED/CANCELLED/ARCHIVED; PREPARING/READY/IN_PROGRESS reserved) with status history; cancellation preserving payments; archive/reactivate; rescheduling with schedule history and conflict re-checks; schedule-conflict warnings with audited overrides; cached-balance verification with repair.
- **Payments:** `PaymentRepository`/`PaymentService` - payments with idempotency keys, overpayment override confirmation, atomic posting (payment + allocation + one linked `BOOKING_PAYMENT` inflow), paired voids (payment + ledger), ledger-link verification, compensating void on partial failure.
- **Receivables:** `ReceivableService` - server-computed payment status (UNPAID/PARTIALLY_PAID/PAID/OVERPAID/REFUNDED/VOIDED), effective paid from allocations minus valid refunds, receivables list with filters, client/booking summaries, cached-total refresh.
- **Refunds:** `RefundService` - eligibility checks (payment minus refunds), amount limits, `REFUND` cash outflow, payment status transitions, paired voids.
- **Controllers:** `BookingController`/`PaymentController` - 22 server functions.
- **UI:** activated Bookings page (summary, filters, pagination, action menu), booking detail workspace with tabs (Overview/Payments/Pricing/Schedule/Timeline/Activity; Production/Deployment/Files placeholders), booking form with live pricing preview and conflict warnings, payment/refund modals, Payments + Receivables page with tabs, internal month calendar (no Google Calendar access), dashboard booking pulse + attention items.
- **Audit actions:** 16 new (BOOKING_CREATED through BOOKING_BALANCE_REPAIRED).
- **Error codes:** 24 new (BOOKING_NOT_FOUND through SCHEDULE_CONFLICT).
- **Tests:** sections 17-20 added to the harness (263/263 total, all passing), including the full manual scenario.

### Changed

- Version bumped to `0.4.0-bookings-receivables`.
- `CashTransactionService`: new types, payment/refund source routing for voids (direct ledger voids of payment transactions are rejected with guidance).
- `BUSINESS_WORKFLOWS.md` WF-2/WF-3 rewritten for the Sprint 3 statuses and payment posting model.
- `FINANCIAL_RULES.md` ledger table includes BOOKING_PAYMENT/REFUND.
- `DATABASE_SCHEMA.md`: 7 new sheet definitions, enums, BKG/BKI/PAY/ALC/RFN/STH/SCH prefixes, schema version 3.0.0.
- `IMPLEMENTATION_PLAN.md`, `TESTING_CHECKLIST.md` (S3 results), `README.md` updated.

### Fixed

- **Load-order crash (`TypeError: Cannot read properties of undefined (reading 'SHEET_BOOKINGS')`):** Apps Script V8 evaluates `.gs` files alphabetically, but `ClientRepository`, `LeadRepository`, `PackageRepository`, `BookingRepository`, and `PaymentRepository` referenced `SheetSchemaService.SHEET_*` at file-load time (files before "S" alphabetically), and `BookingService` referenced `PackageService`/`LeadService` at load time. Sheet-name constants are now plain strings with a runtime schema guard in each repository's `assertDatabase()`, and `BookingService` uses lazy accessors. The test harness now loads files in alphabetical order (mirroring Apps Script), so this class of bug is a permanent regression test.
- `BookingService.buildBookingRecord` parameter order (snapshots and totals now persist correctly).
- Invalid ID prefix usage for status/schedule history (STH/SCH).
- Bookings schema now includes `idempotency_key` (duplicate-submission protection per spec).

---

## [0.3.0-customer-package-foundation] - 2026-08-07

### Added (Sprint 2 - Clients, Leads, and Packages)

- **Schema 2.0.0:** 7 new sheets (Clients, Leads, ClientNotes, ClientInteractions, Packages, PackageItems, PackageAddOns) with frozen headers, formats, and dropdowns; idempotent migration via the existing initializer; metadata version updated.
- **Clients:** `ClientRepository`/`ClientService` - create/update/archive/reactivate, normalized phone/email/URL storage, strong vs possible duplicate detection with audited override reasons, cached totals pinned to zero, notes (WARNING visual distinction, pinned), interactions with follow-up dates, summaries. No hard-delete entry point.
- **Leads:** `LeadRepository`/`LeadService` - validated status machine (NEW→CONTACTED→QUALIFIED→QUOTED→FOLLOW_UP→NEGOTIATING→WON, LOST with required reason, ARCHIVED, reopen with reason), atomic conversion (CREATE new client or LINK existing; lead preserved, WON, converted_client_id; never creates a booking), lead summaries.
- **Packages:** `PackageRepository`/`PackageService` - CRUD with unique active names, server-side profitability (gross = price - cost; margin = gross/price x 100, 0 when price is 0), cost methods MANUAL/PACKAGE_ITEMS with items-sum precedence, atomic item editor (replace-all under lock; the single documented exception to row preservation), reusable add-ons with computed profit. No ledger transactions ever created.
- **Controllers:** `CustomerController`/`PackageController` - 28 server functions plus `getHomeDashboardSummary()`; initializer renamed to `initializeDatabase()`.
- **UI:** activated Clients page (summary, search/filters, pagination, three-dot menu, profile with notes/interactions), Leads page (summary, list, detail with status/conversion/reopen actions, conversion flow with duplicate warnings and carry-over review), Packages page (list, live profit preview form, atomic item editor, add-ons table), home-dashboard customer pulse (Active Clients, Open Leads, Follow-Ups Due, Active Packages); unavailable metrics labeled Unavailable.
- **Audit actions:** 21 new (CLIENT_CREATED through ADD_ON_DEACTIVATED); summaries never include full note bodies.
- **Error codes:** 19 new (CLIENT_NOT_FOUND through PACKAGE_ITEM_VALIDATION_ERROR).
- **Tests:** sections 13-16 added to the harness (180/180 total, all passing), including the full manual scenario.

### Changed

- Version bumped to `0.3.0-customer-package-foundation`.
- `BUSINESS_WORKFLOWS.md` WF-1 rewritten: conversion creates/links a client only; booking creation deferred to Sprint 3; lead statuses aligned with the implementation.
- `PRODUCT_REQUIREMENTS.md` Leads module aligned (pipeline stages, conversion semantics).
- `DATABASE_SCHEMA.md`: 7 new sheet definitions, enums, LED/NTE/INT/ADD prefixes, schema version 2.0.0; removed duplicate DRX prefix row.
- `IMPLEMENTATION_PLAN.md`, `TESTING_CHECKLIST.md` (S2 results), `README.md` updated.

### Fixed

- `PackageService.calculateProfitability` margin rounding (was rounding to 4 decimals of the percent, producing 6444.44 instead of 64.44).
- Possible-duplicate matching: similar name/organization alone now produces a possible-match warning (previously required a phone match that was already caught as a strong duplicate).

---

## [0.2.1-integrations] - 2026-08-07

### Added (Pre-Sprint 2 integration configuration)

- **`IntegrationService.gs`:** read-only verification of the business spreadsheet (accessibility + Sprint 1 schema + schema version), the root Drive folder (accessibility, trash check, name), and the business calendar (accessibility, name, timezone vs Asia/Manila). Each resource checked independently; failures never stop the others. Safe statuses only - resource IDs are never returned, logged, or committed.
- **Server functions:** `getIntegrationStatus()`, `verifySpreadsheetIntegration()`, `verifyDriveIntegration()`, `verifyCalendarIntegration()` with the standard response envelope.
- **`Config.gs`:** private `_`-suffixed accessors (`getSpreadsheetId_()`, `getRootDriveFolderId_()`, `getCalendarId_()`, `getBusinessTimezone_()`, `getBusinessCurrency_()`) that trim values, reject placeholders/empty strings, and throw user-friendly `CONFIGURATION_ERROR`; `hasProperty()` and `hasRequiredIntegrationProperties_()` boolean presence checks.
- **Health endpoint:** `getSystemHealth()` now returns integration statuses (spreadsheet/drive/calendar/overall) plus `databaseStatus` - statuses only, never IDs or resource names.
- **Settings page:** activated with a read-only Google Integrations section - three status cards (Business Database, File Storage, Business Calendar), status badges (Connected/Not Configured/Needs Initialization/Access Denied/Connection Error), Check Connections, and a Setup Instructions modal. No editable ID fields; IDs never rendered.
- **Error codes:** SPREADSHEET/DRIVE_FOLDER/CALENDAR config, access, and not-found codes plus INTEGRATION_CONNECTION_ERROR with owner-actionable messages.
- **Tests:** 29 new automated checks (93 total, all passing) covering missing/placeholder/trimmed properties, connected/not-found/timezone-mismatch paths, read-only verification, and ID-non-exposure in every response including health.

### Changed

- `RepositoryService`/`DatabaseService`/`DateService`/`SetupService`/`CashAccountService` moved to the new `_`-suffixed config accessors.
- `DEPLOYMENT_GUIDE.md`: §10.1 integration execution identity, §10.2 inferred OAuth scopes, §11 property table, §12a full owner resource checklist.
- `SECURITY_MODEL.md`: §9.1 integration resource ID rules (server-only, never logged/returned).
- `BACKUP_RECOVERY.md`: backup folder location under the Drive root.
- `IMPLEMENTATION_PLAN.md`: Sprint 2 pre-requisite note.
- `README.md`: integrations section + structure.

### Fixed

- `IntegrationService` status composition: error/not-configured paths now carry an explicit `status` field (previously undefined, which collapsed the overall status to PARTIALLY_CONFIGURED).

---

## [0.2.0-financial-foundation] - 2026-08-07

### Added (Sprint 1 - Financial Foundation)

- **Database initialization:** `DatabaseService.gs` - idempotent, lock-protected creation of the 6 Sprint 1 sheets (SystemMetadata, CashAccounts, FinancialCategories, CashTransactions, DailyCashReconciliations, AuditLogs); schema version 1.0.0; header validation with `SCHEMA_MISMATCH` protection; frozen headers; formats and dropdowns; metadata storage; system category seeding (26 defaults); development-only reset with confirmation guard.
- **Repository layer:** `RepositoryService.gs` - header-validated sheet access, record CRUD, batch operations, snake_case-to-camelCase public record conversion; immutable IDs never exposed as row numbers.
- **Locking:** `LockManager.gs` - reentrant script locking for financial writes (Apps Script locks are not reentrant).
- **Audit:** `AuditService.gs` - append-only AuditLogs with temporary actor context; 13 audit action types.
- **Cash accounts:** `CashAccountService.gs` - CRUD, active-name uniqueness, masked references, ledger-derived cached balances, recalculate/verify functions.
- **Categories:** `FinancialCategoryService.gs` - CRUD with type enforcement, system categories protected.
- **Ledger:** `CashTransactionService.gs` - 10 transaction types, server-derived directions, category-type compatibility, sufficient-funds checks, idempotency-key duplicate protection, voiding with required reason, balance recalculation.
- **Transfers:** `TransferService.gs` - atomic linked TRANSFER_OUT/TRANSFER_IN pairs sharing a group ID; pair voiding.
- **Opening balances:** `OpeningBalanceService.gs` - immutable OPENING_BALANCE transaction; not revenue; single-per-account.
- **Reconciliation:** `ReconciliationService.gs` - daily expected-closing computation, difference + explanation requirement, duplicate-finalized prevention, no automatic ledger adjustment.
- **Dashboard:** `FinanceDashboardService.gs` - preliminary operational summary (total cash, period inflows/outflows, revenue, operating/capital expenses, owner funds), transfers and openings excluded from period movement.
- **Controller:** `FinanceController.gs` - 24 server functions with standardized envelopes.
- **Cashflow UI:** `finance-page.html`, `finance-components.html`, `finance-scripts.html` - summary cards, accounts panel, transaction history (latest 50), record/transfer/add-account/reconcile modals, transaction detail with void; shell integration for the cashflow route.
- **Tests:** `test/sprint1-tests.js` - 64 automated checks with in-memory GAS mocks covering initialization, accounts, categories, the manual scenario, validation, transfers, voiding, reconciliation, audit, and reset guards. All pass. Static checks: 23 `.gs` files + embedded HTML JS pass `node --check`.

### Changed

- Version bumped to `0.2.0-financial-foundation` (Config.gs + shell footer).
- `ErrorService.gs`: 15 new error codes with user-friendly messages.
- `DATABASE_SCHEMA.md`: SystemMetadata + FinancialCategories sheets documented (supersedes ExpenseCategories); ledger-only balance formula; POSTED/VOIDED statuses for Sprint 1; ACC/CAT/REC ID prefixes.
- `FINANCIAL_RULES.md`: Sprint 1 ledger statuses and transaction types; balance = sum of posted transactions (opening balance is a transaction).
- `IMPLEMENTATION_PLAN.md`, `TESTING_CHECKLIST.md` (Sprint 1 results recorded), `SECURITY_MODEL.md` (temporary actor limitation), `DEPLOYMENT_GUIDE.md` (§8a owner setup), `README.md` (structure + status).

### Fixed

- Balance double-counting: ledger sums now include the OPENING_BALANCE transaction only (the `opening_balance` column is informational).
- Dashboard period inflows/outflows no longer include opening balances or transfers.
- LockManager reentrancy (nested transfer/opening-balance posting would have timed out in real Apps Script).

---

## [0.1.0-foundation] - 2026-08-07

### Added

- **Documentation suite:** `VISION.md`, `PRODUCT_REQUIREMENTS.md`, `DATABASE_SCHEMA.md` (canonical sheet list: 34 required + system sheets), `FINANCIAL_RULES.md`, `BUSINESS_WORKFLOWS.md`, `DESIGN_SYSTEM.md` (approved palette), `ROLE_PERMISSIONS.md` (6 roles), `IMPLEMENTATION_PLAN.md` (Sprints 0-9), `TESTING_CHECKLIST.md`, `DEPLOYMENT_GUIDE.md`, `REPORT_DEFINITIONS.md` (R1-R16), `BACKUP_RECOVERY.md`, `SECURITY_MODEL.md`, `PROJECT_STATUS.md`.
- **Apps Script foundation:**
  - `Code.gs` - `doGet` entry point, HTML include helper, health endpoint.
  - `Config.gs` - Properties Service accessors with safe defaults (no IDs required in Sprint 0).
  - `ResponseService.gs` - standard `{ success, data, message, error, timestamp }` envelope.
  - `ErrorService.gs` - stable error codes and safe error normalization.
  - `LoggerService.gs` - structured logging (DEBUG/INFO/WARN/ERROR), secret filtering.
  - `ValidationService.gs` - general-purpose validators.
  - `IdService.gs` - `PREFIX-YYYY-XXXXXXXX` immutable ID generation.
  - `DateService.gs` - Asia/Manila date helpers.
  - `SetupService.gs` - initialization status.
  - `HealthService.gs` - safe health payload for the SPA.
- **Frontend shell:**
  - `index.html`, `app-shell.html` (sidebar + header + dashboard placeholder), `components.html` (icon set, badges, empty states, alerts, toasts, modals), `styles.html` (design tokens per `DESIGN_SYSTEM.md`), `scripts.html` (hash routing, drawer, health check, toasts).
  - Placeholder pages for all 19 modules; sample-labeled dashboard.
- **Project config:** `src/appsscript.json` (Asia/Manila, V8), `.clasp.json.example`, `.gitignore`, `opencode.jsonc`.

### Changed

- Normalized ID format from sequence-based (`BK-0001`) to immutable `PREFIX-YYYY-XXXXXXXX` across docs and `IdService.gs`.
- Canonicalized sheet names across all documents (e.g., `EventDeployments`, `BookingCosts`, `Users`, `AuditLogs`).
- Roles normalized to Owner, Administrator, Finance Staff, Operations Staff, Crew, Viewer.
- Sprint structure normalized to Sprint 0-9.

### Fixed (Sprint 0 review)

- Moved `appsscript.json` into `src/` so clasp (rootDir `src`) can find the manifest.
- Removed `setXFrameOptionsMode(ALLOWALL)` from `doGet` (restores the secure default).
- `Code.gs` route parameter now sanitized via `sanitizeRoute`; unused template variables removed; `?page=` actually seeds the initial route in the shell.
- `ValidationService.gs`: `isPositiveAmount` now strictly > 0; added `isNonNegativeAmount` (>= 0).
- `scripts.html`: removed unused `pageIds` and `isMobile`; removed the success toast on every load; centralized the app name constant; initial route applied without double render.
- `BUSINESS_WORKFLOWS.md`: added WF-11 Equipment Maintenance, WF-12 Partner Commission Settlement, WF-13 Daily Cash Reconciliation; Periodic Close renumbered to WF-14.
- `VISION.md` and `PRODUCT_REQUIREMENTS.md`: module name normalized to "Event Production"; module map now documents Version 1 scope (priority vs included vs post-V1).

### Documentation

- All 13 docs under `docs/` aligned to the canonical naming, palette, and sprint numbering.
- `DEPLOYMENT_GUIDE.md` and `README.md` corrected for the manifest location under `src/`.

---

## [0.0.0] - 2026-08-07

### Added

- Design phase: initial documentation suite (pre-Sprint 0 baseline).

---

## Versioning Note

The version string lives in a single location: `src/Config.gs` (`APP_VERSION`). It is displayed by the system health endpoint and in the sidebar footer of the shell.
