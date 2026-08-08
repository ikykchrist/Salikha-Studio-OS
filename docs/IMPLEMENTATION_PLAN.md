# IMPLEMENTATION_PLAN.md

## Purpose

Define the build order for Salikha Studio OS. Each sprint has a fixed scope, deliverables, acceptance criteria, and definition of done. Implementation never jumps ahead of this plan.

## Scope

- Sprints 0-9, each with objective, included/excluded features, technical deliverables, acceptance criteria, test requirements, dependencies, and definition of done.
- Estimation and dependency rules.

## Overview

Sprints are ordered so money correctness (Sprint 1) precedes everything that touches money, and operations (bookings, deployments, inventory) build on the identity and catalog foundations. Reports and automation land only after the data they consume exists. Each sprint ships something usable and verifiable in the test environment.

---

## Table of Contents

1. [Principles](#1-principles)
2. [Dependency Map](#2-dependency-map)
3. [Sprint 0 - Project Foundation](#3-sprint-0---project-foundation)
4. [Sprint 1 - Financial Foundation](#4-sprint-1---financial-foundation)
5. [Sprint 2 - Clients, Leads, and Packages](#5-sprint-2---clients-leads-and-packages)
6. [Sprint 3 - Bookings and Receivables](#6-sprint-3---bookings-and-receivables)
7. [Sprint 4 - Expenses and Profitability](#7-sprint-4---expenses-and-profitability)
8. [Sprint 5 - Inventory and Equipment](#8-sprint-5---inventory-and-equipment)
9. [Sprint 6 - Event Deployments](#9-sprint-6---event-deployments)
10. [Sprint 7 - Dashboard and Reports](#10-sprint-7---dashboard-and-reports)
11. [Sprint 8 - Documents and Automation](#11-sprint-8---documents-and-automation)
12. [Sprint 9 - Testing and Production Deployment](#12-sprint-9---testing-and-production-deployment)
13. [Estimation](#13-estimation)
14. [Cross-References](#14-cross-references)

---

## 1. Principles

1. **Sprints end green.** Exit criteria are met in the test environment before the next sprint starts.
2. **Money rules are never deferred.** Sprint 1 invariants bind every later sprint.
3. **One data layer.** No service bypasses it; no hard-coded column indices.
4. **Every mutation is audited** from Sprint 1 onward.
5. **Docs move with code.** Behavior changes update the relevant `docs/` files and `CHANGELOG.md` in the same sprint.
6. **Test data stays in the test workbook.** Production is touched only in Sprint 9.

## 2. Dependency Map

```
Sprint 0 (foundation)
   â””â”€â”€ Sprint 1 (money) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        Sprint 2 (clients/leads/packages) â”€â”€ Sprint 3 (bookings) â”€â”€â”
             Sprint 1 + 3 â”€â”€ Sprint 4 (expenses/profitability) â”€â”€â”€â”¤
             Sprint 2 + 4 â”€â”€ Sprint 5 (inventory/equipment) â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€ Sprint 6 (deployments)
                                                                       â””â”€â”€ Sprint 7 (reports)
             Sprint 7 â”€â”€ Sprint 8 (automation) â”€â”€ Sprint 9 (testing/production)
```

## 3. Sprint 0 - Project Foundation

**Objective:** Stable, documented, deployable foundation. Completed by this master prompt.

**Included:**
- Full documentation suite (VISION, PRODUCT_REQUIREMENTS, DATABASE_SCHEMA, FINANCIAL_RULES, BUSINESS_WORKFLOWS, DESIGN_SYSTEM, ROLE_PERMISSIONS, IMPLEMENTATION_PLAN, TESTING_CHECKLIST, DEPLOYMENT_GUIDE, REPORT_DEFINITIONS, BACKUP_RECOVERY, SECURITY_MODEL).
- Clasp-compatible project layout (`src/`), `appsscript.json`, `.clasp.json.example`, `.gitignore`, `opencode.jsonc`.
- Web app entry point (`Code.gs` doGet + include helper).
- Core utilities: Config, ResponseService, ErrorService, LoggerService, ValidationService, IdService, DateService, SetupService, HealthService.
- Responsive single-page application shell with hash routing, placeholder pages, health check, toasts, modals.
- Project status tracker, changelog, version `0.1.0-foundation`.

**Excluded:** all business modules, sheet initialization, Calendar/Drive integration, real authentication.

**Technical deliverables:** the file tree in `README.md`; version 0.1.0-foundation in `Config.gs`.

**Acceptance criteria:**
- `doGet()` serves the shell; `getSystemHealth()` returns a safe structured response without Sheets/Drive/Calendar IDs.
- Navigation works without reload; placeholders render; mobile drawer, escape key, focus states work.
- No real secrets or Google IDs committed.

**Test requirements:** `docs/TESTING_CHECKLIST.md` Sprint 0 section.

**Dependencies:** none.

**Definition of done:** structure verified, manifest valid, health call works, docs internally consistent, next task is Sprint 0 review (not Sprint 1).

## 4. Sprint 1 - Financial Foundation

**Objective:** The money core: database initialization, cash accounts, financial categories, general cash transactions, transfers, owner funds, voiding, audit, daily reconciliation, and the Cashflow interface.

**Included:** `DatabaseService` (idempotent Sprint 1 sheet initialization: SystemMetadata, CashAccounts, FinancialCategories, CashTransactions, DailyCashReconciliations, AuditLogs; schema version 1.0.0 (bumped to 2.0.0 in Sprint 2); system category defaults), `RepositoryService` (header-validated sheet repository), `LockManager` (reentrant script locking), `AuditService`, `CashAccountService`, `FinancialCategoryService`, `CashTransactionService` (posting/voiding/idempotency), `OpeningBalanceService`, `TransferService` (atomic linked pairs), `ReconciliationService` (daily reconciliation foundation), `FinanceDashboardService` (preliminary operational summary), `FinanceController` (server functions), and the activated Cashflow page (summary cards, accounts panel, transaction history, record/transfer/account/reconciliation modals, transaction detail with void).

**Excluded:** booking payments (RECORDED/VERIFIED/FAILED/REFUNDED arrive with Sprint 3), receivables aging, report suite, inventory, equipment.

**Technical deliverables:** the files above plus `test/sprint1-tests.js` (64 automated checks against in-memory GAS mocks, including the manual scenario).

**Acceptance criteria:** the manual scenario (opening 5,000 + 10,000; owner capital 2,000; income 1,500; electricity 1,200; equipment 2,000; withdrawal 500; transfer 1,000) yields Cash on Hand 5,000, GCash 9,800, total 14,800 with correct classification; duplicate idempotency keys do not double-post; transfers stay balanced and void as pairs; reconciliation never silently adjusts the ledger.

**Test requirements:** S1 checklist incl. financial fixtures - all 64 automated checks pass.

**Dependencies:** Sprint 0.

**Definition of done:** all S1 checklist items pass and recorded.

## 5. Sprint 2 - Clients, Leads, and Packages

**Objective:** Identity and catalog foundation.

**Pre-requisite (completed pre-Sprint 2):** Google integrations configured and verified (spreadsheet, Drive root folder, business calendar) via Script Properties + `IntegrationService`; Settings page shows connection status. See `docs/DEPLOYMENT_GUIDE.md Â§12a`.

**Included:** `ClientRepository`/`ClientService` (CRUD, normalized duplicate detection - strong vs possible, notes, interactions, archive/reactivate), `LeadRepository`/`LeadService` (validated status machine, lost reasons, reopen reasons, atomic conversion that preserves the lead and creates or links a client - never a booking), `PackageRepository`/`PackageService` (packages, server-side profitability, cost methods MANUAL/PACKAGE_ITEMS, atomic item editor, add-ons), `CustomerController`/`PackageController` (server functions), plus the activated Clients/Leads/Packages pages (lists, filters, pagination, profiles, conversion flow, live profit preview, item editor) and the home-dashboard customer pulse. Schema version 2.0.0 (7 new sheets: Clients, Leads, ClientNotes, ClientInteractions, Packages, PackageItems, PackageAddOns).

**Excluded:** bookings and booking payments (Sprint 3), receivables, inventory, reports.

**Technical deliverables:** the files above plus Sprint 2 sections in `test/sprint1-tests.js` (180 automated checks total, all passing).

**Acceptance criteria:** the manual scenario (Maria Santos lead NEW â†’ CONTACTED â†’ QUALIFIED â†’ converted to a new client with WON + converted_client_id and no booking; duplicate phone rejected; Premium Photobooth 4,500/1,600 â†’ gross 2,900 / margin 64.44%; item cost totals server-calculated) passes in the automated suite.

**Test requirements:** S2 checklist - results recorded in `docs/TESTING_CHECKLIST.md`.

**Dependencies:** Sprints 0, 1 + pre-Sprint 2 integration configuration.

**Definition of done:** S2 checklist green (180/180 automated checks pass).

## 6. Sprint 3 - Bookings and Receivables

**Objective:** The transaction hub: bookings, snapshot pricing, payments, receivables, cancellation, rescheduling, and the internal calendar.

**Included:** `BookingRepository`/`BookingService` (create/update with server-side pricing, status machine with history, cancellation preserving payments, archive/reactivate, rescheduling with history, schedule-conflict warnings with audited overrides, cached-balance verification), `BookingPricingService` (package + add-ons + custom charges + transportation − discount; planned commission internal only; estimated profitability), `BookingItemService`-equivalent (atomic snapshot lines), `BookingStatusService`, `BookingConflictService`, `BookingTimelineService`, `PaymentRepository`/`PaymentService` (payments with idempotency, overpayment confirmation, paired ledger voids, ledger-link verification), `ReceivableService` (server-computed payment status, receivables list, cached-total refresh), `RefundService` (foundation with eligibility checks and paired ledger voids), `BookingController`/`PaymentController`, plus the activated Bookings/Payments/Calendar pages (booking form with live pricing + conflict warnings, detail workspace with tabs, payment/refund modals, receivables view, month calendar). Schema version 3.0.0 (7 new sheets; `BOOKING_PAYMENT`/`REFUND` cash transaction types; system categories "Client Booking Payment" and "Client Refund").

**Excluded:** production/deployment workflows, inventory, reports, calendar integration (no Google Calendar events), PDFs.

**Technical deliverables:** the files above plus Sprint 3 sections in `test/sprint1-tests.js` (263 automated checks total, all passing).

**Acceptance criteria:** the manual scenario (Premium Photobooth Deluxe 4,500 + 1,000 + 500 + 400 − 300 = 6,100; est. cost 2,000 → profit 4,100 / margin 67.21%; down payment 2,000 → GCash +2,000; second payment 1,500 → balance 2,600 PARTIALLY_PAID; void second payment → balance 4,100 and cash restored) passes in the automated suite.

**Test requirements:** S3 checklist - results recorded in `docs/TESTING_CHECKLIST.md`.

**Dependencies:** Sprints 0-2 + pre-Sprint 2 integration configuration.

**Definition of done:** S3 checklist green (263/263 automated checks pass).

## 7. Sprint 4 - Expenses and Profitability

**Objective:** Money-out with approval workflow, and per-booking profitability.

**Included:** ExpenseService (DRAFT/SUBMITTED/APPROVED/REJECTED/PAID), direct-cost tagging, expense categories, BookingCosts computation (material/transport/meals/crew/commission/other direct, gross/net/margin), Expenses screen + approval queue.

**Excluded:** inventory cost capture (Sprint 5/6 feeds material).

**Technical deliverables:** ExpenseService, BookingProfitService, DailyCashReconciliations sheet.

**Acceptance criteria:** only PAID expenses mint cash EXPENSE transactions; direct-tagged expenses update BookingCosts and trigger recalcs; allocOpsCost policy per `docs/FINANCIAL_RULES.md`.

**Test requirements:** S4 checklist incl. direct vs operating, gross/net fixtures.

**Dependencies:** Sprints 1, 3.

**Definition of done:** S4 checklist green.

## 8. Sprint 5 - Inventory and Equipment

**Objective:** Stock, batches, valuation, purchasing, and the asset registry.

**Included:** InventoryService (items, batches, movements, weighted-average, negative-stock guard), PurchaseService (PO lifecycle, receipts create batches), EquipmentService (registry, maintenance via EquipmentMovements), screens: Inventory, Purchasing, Equipment.

**Excluded:** deployment material consumption posting (Sprint 6).

**Technical deliverables:** InventoryService, PurchaseService, EquipmentService; InventoryItems/Batches/Movements, Equipment/Movements, Purchases/Items, Suppliers sheets.

**Acceptance criteria:** weighted-average fixture matches; negative stock impossible; PO partial receipt correct; equipment capital purchase does not hit operating expense.

**Test requirements:** S5 checklist incl. inventory purchase/usage/damage fixtures.

**Dependencies:** Sprints 2, 4.

**Definition of done:** S5 checklist green.

## 9. Sprint 6 - Event Deployments

**Objective:** The event loop: production prep, deployment form, crew sign-off, return reconciliation.

**Included:** TaskService for production prep, DeploymentService (auto-create on production readiness; PLANNED/LOADING/IN_PROGRESS/RETURNED/RECONCILED/CLOSED), DeploymentItems consumption, DeploymentEquipment, DeploymentChecklists, DeploymentIncidents, reconciliation posts inventory movements and recalculates BookingCosts, Crew/Assignments/Payments screens, Partners/Commissions screens.

**Excluded:** report suite (Sprint 7).

**Technical deliverables:** DeploymentService, EventDeployments + child sheets, CrewService, PartnerService, commission settlement.

**Acceptance criteria:** full deployment hand-run matches fixtures (load 10, return 4, consume 6); RECONCILED blocked with unsignoffed crew or incomplete checklist; post-reconcile edits blocked.

**Test requirements:** S6 checklist incl. returned deployment stock, damaged inventory, direct event costs.

**Dependencies:** Sprints 4, 5.

**Definition of done:** S6 checklist green.

## 10. Sprint 7 - Dashboard and Reports

**Objective:** All v1.0 reports and the dashboard.

**Included:** report services (cashflow, income statement, AR, revenue by service/package, booking profitability, expense breakdown, inventory valuation/movement, low stock, equipment status, partner commissions, crew payments, daily cash reconciliation, gross vs net), Dashboard KPIs, export (CSV).

**Excluded:** PDF generation, scheduled email.

**Technical deliverables:** `reports/` services; Reports screen; dashboard data contract.

**Acceptance criteria:** every report matches its definition and fixture in `docs/REPORT_DEFINITIONS.md`; dashboard figures equal underlying reports.

**Test requirements:** S7 checklist incl. all report fixtures.

**Dependencies:** Sprints 1-6.

**Definition of done:** S7 checklist green.

## 11. Sprint 8 - Documents and Automation

**Objective:** Files module, Calendar mirror, backup automation, notifications.

**Included:** FileService (Drive tree, role-scoped), Google Calendar mirror (bookings -> events, SyncLog), daily backup trigger, weekly email digests, low-stock alerts.

**Excluded:** multi-tenant hosting, payment gateways.

**Technical deliverables:** FileService, CalendarService, BackupService, digest job.

**Acceptance criteria:** mirror idempotent; backup job writes per schedule; digest delivers; no automation writes without audit.

**Test requirements:** S8 checklist.

**Dependencies:** Sprints 6, 7.

**Definition of done:** S8 checklist green.

## 12. Sprint 9 - Testing and Production Deployment

**Objective:** Full verification and go-live.

**Included:** automated unit tests (sequences, validation, state machines, permissions, balance math, audit), full `TESTING_CHECKLIST.md` pass, performance smoke, production workbook + deployment per `DEPLOYMENT_GUIDE.md`, migration of legacy data with reconciliation, go-live checklist, rollback plan.

**Excluded:** new features.

**Technical deliverables:** test runner, production workbook, deployed web app version 1.0.0.

**Acceptance criteria:** zero open P0/P1 defects; backup restore drill passed; first production booking + payment verified by owner.

**Test requirements:** S9 checklist incl. deployment, recovery, regression.

**Dependencies:** all prior sprints.

**Definition of done:** go-live signed off by owner; `PROJECT_STATUS.md` updated to Released 1.0.0.

## 13. Estimation

Rough effort (senior GAS developer, part-time):
Sprint 0: 5 dev-days (this prompt) - Sprint 1: 6 - Sprint 2: 4 - Sprint 3: 6 - Sprint 4: 5 - Sprint 5: 6 - Sprint 6: 8 - Sprint 7: 6 - Sprint 8: 4 - Sprint 9: 5. Total approx. 55 dev-days.

## 14. Cross-References

- Definition of done: `AGENTS.md`
- Data contract: `docs/DATABASE_SCHEMA.md`
- Money rules: `docs/FINANCIAL_RULES.md`
- Workflows: `docs/BUSINESS_WORKFLOWS.md`
- Verification: `docs/TESTING_CHECKLIST.md`
- Shipping: `docs/DEPLOYMENT_GUIDE.md`, `docs/BACKUP_RECOVERY.md`
- Security: `docs/SECURITY_MODEL.md`
- Status tracking: `PROJECT_STATUS.md`
