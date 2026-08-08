# TESTING_CHECKLIST.md

## Purpose

The verification contract for every sprint and for release. Items pass only when actually performed and recorded in this document (or a referenced test log).

## Scope

- Global invariants (every sprint).
- Per-sprint checklists (Sprint 0-9).
- Financial validation cases with fixtures from `docs/FINANCIAL_RULES.md` and `docs/REPORT_DEFINITIONS.md`.
- Test data rules.

## Overview

Two layers: automated GAS unit tests (test workbook) and manual/semi-automated checks. All financial tests use hand-computed fixtures. Test data never mixes with production data.

---

## Table of Contents

1. [How to Record Results](#1-how-to-record-results)
2. [Global Invariants](#2-global-invariants)
3. [Sprint 0 - Foundation](#3-sprint-0---foundation)
4. [Sprint 1 - Financial Foundation](#4-sprint-1---financial-foundation)
5. [Sprint 2 - Clients, Leads, Packages](#5-sprint-2---clients-leads-packages)
6. [Sprint 3 - Bookings and Receivables](#6-sprint-3---bookings-and-receivables)
7. [Sprint 4 - Expenses and Profitability](#7-sprint-4---expenses-and-profitability)
8. [Sprint 5 - Inventory and Equipment](#8-sprint-5---inventory-and-equipment)
9. [Sprint 6 - Event Deployments](#9-sprint-6---event-deployments)
10. [Sprint 7 - Reports](#10-sprint-7---reports)
11. [Sprint 8 - Documents and Automation](#11-sprint-8---documents-and-automation)
12. [Sprint 9 - Production Deployment](#12-sprint-9---production-deployment)
13. [Financial Validation Cases](#13-financial-validation-cases)
14. [Test Categories Reference](#14-test-categories-reference)
15. [Defect Severity](#15-defect-severity)
16. [Cross-References](#16-cross-references)

---

## 1. How to Record Results

Record each item: `[ ] ITEM - PASS (date, by, test-id)` or `BLOCKED (reason)`. Append a run log at the end of each sprint's section.

## 2. Global Invariants

| # | Check | Result |
|---|---|---|
| G1 | Cash balance = sum of VERIFIED transactions only (never booking math) | |
| G2 | No VERIFIED transaction can be edited or deleted; void + reversal only | |
| G3 | No physical deletion of financial/operational rows | |
| G4 | Every mutation wrote an audit entry with actor, before/after | |
| G5 | Every backend entry point enforced role authorization | |
| G6 | No service reads Session directly; request context used | |
| G7 | Sheet access only via the data layer; no hard-coded column indices | |
| G8 | Money stored as numbers; time as DateTime; timezone from settings | |
| G9 | Loading/empty/error states present on all data screens | |
| G10 | Negative inventory on-hand impossible | |
| G11 | Docs and CHANGELOG updated with behavior changes in the same change | |

## 3. Sprint 0 - Foundation

| # | Check | Result |
|---|---|---|
| S0-1 | All required documentation exists (VISION through SECURITY_MODEL + PROJECT_STATUS) | |
| S0-2 | All required source files exist in `src/` | |
| S0-3 | No business module implemented | |
| S0-4 | No sensitive ID or secret committed | |
| S0-5 | `appsscript.json` valid; timezone Asia/Manila; runtime V8 | |
| S0-6 | `doGet()` serves the shell; includes resolve without errors | |
| S0-7 | Server utilities compile (no syntax errors) | |
| S0-8 | `getSystemHealth()` returns structured response without secrets | |
| S0-9 | Config defaults work with no Script Properties set | |
| S0-10 | Dashboard shell loads; sidebar navigation works; all placeholders open | |
| S0-11 | Active nav state and page titles update | |
| S0-12 | Mobile drawer opens/closes; escape key closes; click-outside closes | |
| S0-13 | Health status displays connected state; error state on failure path | |
| S0-14 | Layout renders on desktop, tablet, mobile | |
| S0-15 | No console errors; no broken includes | |
| S0-16 | Docs consistent: sheet names, module names, sprint numbering, design tokens, V1 scope | |

## 4. Sprint 1 - Financial Foundation

Results recorded 2026-08-07 via `node test/sprint1-tests.js` (64/64 automated checks) plus static review. Booking-payment cases (deposit/final/VERIFIED) are Sprint 3 scope and removed from this sprint.

| # | Check | Result |
|---|---|---|
| S1-1 | Missing SPREADSHEET_ID produces CONFIGURATION_ERROR | PASS (automated) |
| S1-2 | Initialization creates the approved sheets; schema version 2.0.0 stored | PASS (automated) |
| S1-3 | Re-initialization is idempotent (no duplicate sheets) | PASS (automated) |
| S1-4 | Mismatched headers produce SCHEMA_MISMATCH; nothing altered | PASS (automated) |
| S1-5 | System categories seeded; protected from deactivation | PASS (automated) |
| S1-6 | Account with zero/positive opening balance created; opening is not revenue | PASS (automated) |
| S1-7 | Duplicate active account name rejected; invalid type rejected; negative opening rejected | PASS (automated) |
| S1-8 | Inactive account cannot receive new transactions; history preserved | PASS (automated) |
| S1-9 | General income increases cash; operating expense decreases cash | PASS (automated) |
| S1-10 | Capital expense decreases cash and stays separate from operating expenses | PASS (automated) |
| S1-11 | Owner capital increases cash but not revenue; withdrawal decreases cash but not operating expense | PASS (automated) |
| S1-12 | Zero/negative amounts, missing description, inactive category rejected | PASS (automated) |
| S1-13 | Insufficient funds rejected for outflows and transfers | PASS (automated) |
| S1-14 | Duplicate idempotency key returns existing transaction; no double post | PASS (automated) |
| S1-15 | Transfer creates linked TRANSFER_OUT/TRANSFER_IN pair sharing one group ID | PASS (automated) |
| S1-16 | Transfer neutrality: total business cash unchanged; transfers do not inflate period inflows/outflows | PASS (automated) |
| S1-17 | Same source/destination rejected (TRANSFER_ACCOUNT_CONFLICT) | PASS (automated) |
| S1-18 | Void requires reason; voided remains visible; balance excludes voided | PASS (automated) |
| S1-19 | Already voided cannot be voided again | PASS (automated) |
| S1-20 | Transfer pair voids together (both sides) | PASS (automated) |
| S1-21 | Reconciliation: expected closing computed from ledger; zero-diff saved | PASS (automated) |
| S1-22 | Non-zero difference requires explanation; duplicate finalized reconciliation rejected | PASS (automated) |
| S1-23 | Reconciliation never silently adjusts the ledger | PASS (automated) |
| S1-24 | Balance verification finds zero inconsistencies | PASS (automated) |
| S1-25 | Audit entries for DATABASE_INITIALIZED/ACCOUNT_CREATED/TRANSACTION_POSTED/VOIDED/TRANSFER_POSTED/DAILY_RECONCILIATION_SAVED | PASS (automated) |
| S1-26 | Development reset refuses in production; requires exact confirmation; preserves headers | PASS (automated) |
| S1-27 | Manual scenario: Cash 5,000 / GCash 9,800 / total 14,800; revenue 1,500; operating 1,200; capital 2,000; owner capital 2,000; withdrawal 500 | PASS (automated) |
| S1-28 | UI: Cashflow page renders, forms validate, save buttons disable, toasts appear, sections refresh (requires deployed web app) | NOT TESTED - owner deployment pending |

## 5. Sprint 2 - Clients, Leads, Packages

Results recorded 2026-08-07 via `node test/sprint1-tests.js` (sections 13-16, part of 180/180 total) plus static review.

| # | Check | Result |
|---|---|---|
| S2-1 | Client created with valid phone; email-only creation works; no-contact rejected (CLIENT_CONTACT_REQUIRED) | PASS (automated) |
| S2-2 | Phone normalized; client code = client ID; cached totals zero | PASS (automated) |
| S2-3 | Duplicate phone / email / Facebook URL detected (DUPLICATE_CLIENT) | PASS (automated) |
| S2-4 | Similar name alone -> possible match; override reason required; override audited | PASS (automated) |
| S2-5 | Client update / archive / reactivate; archived cannot be edited; archived remains retrievable | PASS (automated) |
| S2-6 | No hard-delete entry point exists for clients | PASS (automated) |
| S2-7 | Notes (incl. WARNING) and interactions created; missing summary / orphan interaction rejected | PASS (automated) |
| S2-8 | Client summary counts notes and interactions | PASS (automated) |
| S2-9 | Lead created NEW; CONTACTED / QUALIFIED transitions valid; WON via status change rejected | PASS (automated) |
| S2-10 | LOST without reason rejected; backward transitions rejected; reopen requires reason | PASS (automated) |
| S2-11 | Conversion (CREATE) creates client, lead WON + converted_client_id, lead preserved | PASS (automated) |
| S2-12 | Double conversion rejected; conversion (LINK) to existing client works | PASS (automated) |
| S2-13 | Conversion creates no cash transactions; no Bookings sheet exists | PASS (automated) |
| S2-14 | Follow-up dates stored; archived leads cannot convert | PASS (automated) |
| S2-15 | Package created; duplicate active name rejected; negative price/cost rejected | PASS (automated) |
| S2-16 | Expected gross profit 2,900 and margin 64.44% for 4,500/1,600; zero-price margin = 0 | PASS (automated) |
| S2-17 | Package items save atomically (7 items, cost total 1,700); replace-all works; duplicates rejected | PASS (automated) |
| S2-18 | PACKAGE_ITEMS cost method recalculates package cost/profit server-side | PASS (automated) |
| S2-19 | Deactivate/reactivate package; inactive remains retrievable | PASS (automated) |
| S2-20 | Add-ons: create, profit 850 / margin 85%, duplicate name rejected, deactivate | PASS (automated) |
| S2-21 | No financial transactions created by any Sprint 2 record | PASS (automated) |
| S2-22 | Audit actions present (CLIENT_CREATED, LEAD_CONVERTED, PACKAGE_ITEMS_UPDATED, etc.); no full note bodies in summaries | PASS (automated) |
| S2-23 | Home dashboard pulse counts; unavailable metrics labeled unavailable | PASS (automated) |
| S2-24 | Search, filters, and pagination on clients | PASS (automated) |
| S2-25 | UI: Clients/Leads/Packages pages render, forms, modals, item editor, conversion flow (requires deployed web app) | NOT TESTED - deployment pending |

## 6. Sprint 3 - Bookings and Receivables

Results recorded 2026-08-07 via `node test/sprint1-tests.js` (sections 17-20, part of 263/263 total) plus static review.

| # | Check | Result |
|---|---|---|
| S3-1 | Booking created with snapshot pricing; total 6,100 (4,500+1,000+500+400-300) | PASS (automated) |
| S3-2 | Package snapshot stored; later catalog edits never rewrite booking prices | PASS (automated) |
| S3-3 | Estimated cost 2,000 / profit 4,100 / margin 67.21%; zero-total margin safe | PASS (automated) |
| S3-4 | Booking creation creates NO cash movement | PASS (automated) |
| S3-5 | Duplicate idempotency key does not create a second booking | PASS (automated) |
| S3-6 | Inactive/archived client rejected; excessive/percentage>100 discounts rejected | PASS (automated) |
| S3-7 | Status transitions validated; reserved statuses rejected; COMPLETED before event date needs override | PASS (automated) |
| S3-8 | Cancellation requires reason; cancelled booking remains stored; payments preserved | PASS (automated) |
| S3-9 | Status history rows created per transition | PASS (automated) |
| S3-10 | Overlapping schedules produce conflict warnings; override with reason allowed and audited | PASS (automated) |
| S3-11 | Cancelled bookings excluded from conflict detection | PASS (automated) |
| S3-12 | Rescheduling preserves previous schedule and records history | PASS (automated) |
| S3-13 | Down payment 2,000 posts to GCash (+2,000) with one linked BOOKING_PAYMENT inflow | PASS (automated) |
| S3-14 | Second payment 1,500 to Cash on Hand; paid 3,500 / balance 2,600 / PARTIALLY_PAID | PASS (automated) |
| S3-15 | Duplicate payment idempotency key creates nothing | PASS (automated) |
| S3-16 | Overpayment requires explicit override; status becomes OVERPAID; void restores | PASS (automated) |
| S3-17 | Voiding payment voids linked cash transaction; Cash on Hand restored; balance 4,100 | PASS (automated) |
| S3-18 | Direct ledger void of a payment transaction is routed back to the payment workflow | PASS (automated) |
| S3-19 | Payment-ledger link verification consistent | PASS (automated) |
| S3-20 | Receivables list, client/booking summaries, and cached-balance verification match | PASS (automated) |
| S3-21 | Refund eligibility = payment - refunds; over-refund rejected; refund posts REFUND outflow | PASS (automated) |
| S3-22 | Payment statuses: PARTIALLY_REFUNDED after partial refund | PASS (automated) |
| S3-23 | Audit actions present (BOOKING_CREATED, PAYMENT_RECORDED, REFUND_RECORDED, etc.) | PASS (automated) |
| S3-24 | No Sprint 4+ sheets created (deployments/inventory) | PASS (automated) |
| S3-25 | Regression: Sprint 1 cashflow, Sprint 2 clients/packages still work | PASS (automated) |
| S3-26 | UI: Bookings/Payments/Calendar pages, detail tabs, forms (requires deployed web app) | NOT TESTED - deployment pending |

## 7. Sprint 4 - Expenses and Profitability

Results recorded 2026-08-08 via `node test/sprint1-tests.js` (sections 21-25, part of 344/344 total) plus static review.

| # | Check | Result |
|---|---|---|
| S4-1 | Only PAID expenses create cash EXPENSE transactions | PASS (automated) |
| S4-2 | Direct-tagged expense updates BookingCosts + recalc (FC-10) | PASS (automated) |
| S4-3 | Approver != payer enforced (separation of duties) | PASS (automated) |
| S4-4 | Gross profit and net income fixtures (FC-11, FC-12) | PASS (automated) |
| S4-5 | Operating cost allocation policy applied correctly | PASS (automated) |
| S4-6 | Expense lifecycle: DRAFT -> SUBMITTED -> APPROVED -> PAID; REJECTED requires reason and reopens to DRAFT | PASS (automated) |
| S4-7 | Voiding a PAID expense voids its linked ledger transaction; balance restored; no hard delete | PASS (automated) |
| S4-8 | Expense summary counts/totals (drafts, for approval, approved to pay, paid net, direct net) correct | PASS (automated) |
| S4-9 | Allocation toggle (ALLOCATE_OPERATING_COSTS) OFF: snapshots recomputed, allocOpsCost = 0; ON restores policy; change audited | PASS (automated) |
| S4-10 | BookingCosts snapshot: buckets, grossProfit, netProfit, margin recomputed on pay/void and toggle recalc | PASS (automated) |
| S4-11 | No Sprint 5+ sheets created (inventory/equipment/deployments); expenses operate on existing schema 3.0.0 sheets | PASS (automated) |
| S4-12 | Regression: Sprint 1-3 cashflow/bookings/payments/clients still work | PASS (automated) |
| S4-13 | UI: Expenses page, booking Profitability tab, Settings allocation toggle (requires deployed web app) | NOT TESTED - deployment pending |

## 8. Sprint 5 - Inventory and Equipment

Results recorded 2026-08-08 via `node test/sprint1-tests.js` (sections 26-30, part of 507/507 total) plus static review.

| # | Check | Result |
|---|---|---|
| S5-1 | Weighted-average fixture (FC-8) | PASS (automated: batches 100@18 + 50@16 -> on-hand 150, avg 17.33, value 2,600) |
| S5-2 | STOCK_IN on receipt creates batch + movement | PASS (automated) |
| S5-3 | Negative on-hand blocked (G10) | PASS (automated: NEGATIVE_STOCK) |
| S5-4 | PO partial receipt: batch per received line | PASS (automated: partial -> PARTIALLY_RECEIVED, then RECEIVED) |
| S5-5 | Damaged inventory via WRITE_OFF/ADJUSTMENT (FC-9) | PASS (automated: WRITE_OFF + positive ADJUSTMENT; refund/return restores batches) |
| S5-6 | Equipment purchase recorded as capital, not operating expense | PASS (automated: creates NO cash transaction; straight-line depreciation report-only) |

### Sprint 5 review hardening (2026-08-09)

| # | Check | Result |
|---|---|---|
| S5-RH-1 | Movement ledger truthfulness: `recordStockIn` / `recordUsage` / `recordStockReturn` return the real stored `movementId` (matches the `InventoryMovements` row id) | PASS (static review: `appendMovement` now returns its id and every call site propagates it; previous return-id mismatch would have orphaned the caller-side id from the sheet) |
| S5-RH-2 | `InventoryService.listItems` performs ONE full-sheet read of `InventoryBatches` and groups in memory (no per-item full-sheet reads) | PASS (static review + automated: fixture of two items = 2 sheet reads total) |
| S5-RH-3 | `InventoryService.getPageData(filters)` returns summary KPIs + enriched rows + lookups in a single request | PASS (static review; exposed via `InventoryController.getInventoryPageData`) |
| S5-RH-4 | `InventoryService.getItemDetailView(itemId)` returns item + balance + batches + last 50 movements in a single request | PASS (static review; exposed via `InventoryController.getInventoryItemDetailView`) |
| S5-RH-5 | `recordOpeningStock` routes through `recordStockIn` with `SOURCE_OPENING` and writes a distinct `OPENING_STOCK_RECORDED` audit row | PASS (static review; movement type stays `STOCK_IN`, valuation unchanged) |
| S5-RH-6 | `recordUsage` accepts `STOCK_USAGE`, `WRITE_OFF`, and `ADJUSTMENT`, mapping each to the matching audit action | PASS (static review + automated regression: existing S5 audit-set assertion still green) |
| S5-RH-7 | `InventoryPermissionService` enforces OWNER/ADMIN/OPERATIONS write matrix when an actor carries a role; allows actors without a role (temporary boundary, `docs/SECURITY_MODEL.md §2.1`) | PASS (static review: same posture as `FilePermissionService` and `ReportPermissionService`; controller guards every mutation entry point through `guardInventoryWrite()`) |
| S5-RH-8 | Existing S5 audit-set assertion (`STOCK_USAGE_RECORDED`, `STOCK_WRITE_OFF_RECORDED`, `STOCK_IN_RECORDED`, `STOCK_RETURN_RECORDED`, `INVENTORY_ITEM_CREATED`) still green after the hardening | PASS (automated: harness section 26 unchanged; full suite **942 passed / 0 failed**) |

### Sprint 5/9 Purchasing module completion (2026-08-09)

| # | Check | Result |
|---|---|---|
| S5P-1 | `PurchasePermissionService.gs` loaded and matrix exposes OWNER/ADMIN/OPERATIONS | PASS (automated) |
| S5P-2 | Supplier CRUD active-name duplicate guard, payment-terms-days non-negative | PASS (automated, reuses S5 fixture) |
| S5P-3 | Purchase creation as `DRAFT`, total = sum(line quantity x unit cost) + shipping (100 paper @ 10 + 50 magnet @ 5 = 1,250) | PASS (automated) |
| S5P-4 | Place Order: `DRAFT -> ORDERED`; re-ordering rejected; invalid line references rejected | PASS (automated) |
| S5P-5 | Purchase detail view returns purchase + lines + empty `receiptHistory` before any receipt | PASS (automated) |
| S5P-6 | Partial receipt 60 paper + 20 magnet -> `PARTIALLY_RECEIVED`, 2 stock batches, no cash, no expense | PASS (automated) |
| S5P-7 | Outstanding after partial receipt: paper 40 / magnet 30 | PASS (automated) |
| S5P-8 | Over-receipt rejected with `PURCHASE_RECEIVED_EXCEEDS_QTY` (no silent cap) | PASS (automated) |
| S5P-9 | Final receipt 40 paper + 30 magnet -> `RECEIVED`, totals paper 100 / magnet 50 | PASS (automated) |
| S5P-10 | Idempotent retry of first receipt with the same key rejected (`RECEIPT_IDEMPOTENCY_EXISTS`); stock unchanged | PASS (automated) |
| S5P-11 | Detail `receiptHistory` enumerates every STOCK_IN movement under this PO (2 receipts x 2 stock lines = 4) | PASS (automated) |
| S5P-12 | Audit: `SUPPLIER_CREATED`, `PURCHASE_CREATED`, `PURCHASE_ORDERED`, `PURCHASE_RECEIVED` recorded | PASS (automated) |
| S5P-13 | `getPurchasingPageData` returns enriched rows with supplier name, ordered/received totals, progress percentage, and lookups (statuses, suppliers, inventoryItems) in one request | PASS (automated) |
| S5P-14 | `getSupplierPanel` aggregates `purchaseCount` + `lastPurchaseDate` from a single read | PASS (automated) |
| S5P-15 | Search by id prefix and status filter work; rows expose `lineCount` + `progressPct` for mobile cards | PASS (automated) |
| S5P-16 | Existing Sprint 5 fixture (20 batteries @ 18 + 4 ink @ 25 + 200 shipping = 660; partial -> full) still green | PASS (automated: harness section 29 unchanged) |
| S5P-17 | Frontend Purchasing page wired in `index.html` + `scripts.html` (`window.PURCHASING.activate`) - 3 new includes (`purchasing-page`, `purchasing-components`, `purchasing-scripts`) | PASS (static review; deployment pending owner) |
| S5P-18 | Full suite **979 passed / 0 failed** (942 + 37 new Purchasing checks) | PASS (automated) |
| S5P-19 | Owner verification on the deployed web app 2026-08-09: supplier create -> PO draft -> edit -> place order -> partial receipt (60 paper + 20 magnet) -> second receipt (40 paper + 30 magnet) -> status RECEIVED; idempotency, over-receipt rejection, no-cash-on-receipt, audit trail all confirmed | PASS (owner runtime verification) |

**Purchasing module: FULLY FUNCTIONAL** (server + client + owner runtime verification, 2026-08-09).

## 9. Sprint 6 - Event Deployments

Results recorded 2026-08-08 via `node test/sprint1-tests.js` (sections 31-37 plus review hardening 37b/37c, part of 535/535 total) plus static review.

| # | Check | Result |
|---|---|---|
| S6-1 | Deployment auto-created on production readiness | PASS (automated: 1:1; second create rejected DEPLOYMENT_ALREADY_EXISTS) |
| S6-2 | LOADING captures loaded qty; IN_PROGRESS locks it | PASS (automated: loaded qty editable during LOADING only; DEPLOYMENT_EDIT_BLOCKED after depart) |
| S6-3 | Consumed = loaded - returned; inventory movements posted (FC-9) | PASS (automated: load 10 / return 4 / consume 6 @ unit cost; STOCK_USAGE 6 + STOCK_RETURN 4) |
| S6-4 | RECONCILED blocked with unsignoffed crew or incomplete required checklist | PASS (automated: DEPLOYMENT_CHECKLIST_INCOMPLETE; DEPLOYMENT_SIGNOFF_REQUIRED) |
| S6-5 | actualMaterialCost computed; BookingCosts recalculated (FC-10) | PASS (automated: booking material cost + profit recomputed post-reconcile) |
| S6-6 | Post-RECONCILED edits blocked; corrections via ADJUSTMENT | PASS (automated: DEPLOYMENT_EDIT_BLOCKED on materials/checklist; reconciliation single-run) |
| S6-7 | Mobile: full deployment form usable on 375px viewport | NOT TESTED - requires deployed web app (UI wired 2026-08-08, deployment pending) |
| S6-8 | UI: Production page - booking list, task workspace, plan/complete/reopen/cancel, readiness badge, mark-ready gate | NOT TESTED - static review only; server contracts verified (getTasks/planProduction/completeTask/reopenTask/cancelTask/markReadyToDeploy), deployment pending |
| S6-9 | UI: Deployments page - register filters/search, workspace, Start loading/Depart/Mark returned (returned-qty capture)/Reconcile, material add/edit, equipment assign, checklist toggle/add, incident log/resolve | NOT TESTED - static review only; server contracts verified (all 15 DeploymentController entry points), deployment pending |
| S6-10 | Availability guard: adding or updating a material whose loaded qty exceeds current on-hand is rejected (DEPLOYMENT_EXCEEDS_AVAILABLE_QUANTITY); negative quantities rejected | PASS (automated: available 5, loaded 10 rejected on add and on update; loaded 5 accepted) |

## 10. Sprint 7 - Reports

Results recorded 2026-08-08 via `node test/sprint1-tests.js` (sections 38-46, part of 757/757 total) plus static review.

| # | Check | Result |
|---|---|---|
| S7-1 | Each report matches its definition and fixture in REPORT_DEFINITIONS.md | PASS (automated: R1-R16 all exercised; R2 ledger position incl. in-range opening balances, R4 receivables buckets CURRENT/1-30/31-60/61-90/90+, R5 shares ~100%, R9 valuation incl. per-batch rounding, R10 movement running totals vs ledger, R11 low stock incl. shortage, R12 depreciation/maintenance, R13 commissions, R14 crew, R15 reconciliation, R16 cash conversion) |
| S7-2 | Every money report states its transaction scope | PASS (automated: R2/R15/R16 scope strings assert posted-only + separation of transfers/opening balances; expense-based reports scope PAID-only) |
| S7-3 | Dashboard KPIs equal underlying reports | PASS (automated: money pulse from ledger, alerts.lowStockItems mirrors R11 summary.itemCount, booking pulse from BookingService summary; revenueVsCosts3m equals R3 per month) |
| S7-4 | CSV export parseable and complete | PASS (automated: filename `salikha-<id>-yyyy-mm-dd.csv`, RFC-4180 quoting, numbers raw, booleans TRUE/FALSE, formula-start cells prefixed `'`, MAX_ROWS truncation at 2000, null/undefined empty, export audited exactly once) |
| S7-5 | Review hardening (section 46): booking eligibility invariant shared by dashboard + reports (TENTATIVE/CANCELLED excluded everywhere); R6 revenue = BookingCosts net of discount incl. Unknown package group + avgPrice; R7 cost buckets sum to directCost, totals = row sums; R8 sharePct consistency; R9/list repos unbounded listing (pageSize 0); R11 LOW_STOCK_MULTIPLIER honored and restorable (shortage 15 -> 35 -> 15); R12 maintenance-due state machine (never-serviced = due, today's maintenance clears, >30 days returns due); dashboard month revenue equals R3 revenue | PASS (automated: 4 new bookings incl. net-price 3,700, backdated maintenance row, multiplier toggle; 23/23 checks green re-running all earlier sections) |

## 11. Sprint 8 - Documents and Automation

Results recorded 2026-08-08 via `node test/sprint1-tests.js` (sections 47-55, part of 902/902 total) plus static review. Section 55 is the Sprint 8 review-hardening pass (2026-08-08).

| # | Check | Result |
|---|---|---|
| S8-1 | Calendar mirror idempotent; SyncLog updated | PASS (automated: event created with venue/description, re-sync updates by external id without duplicate, SKIPPED when no CALENDAR_ID, cancelled booking removes event, removal idempotent, remove-mapping-missing SKIPPED, eligible status without event date syncs FAILED without throwing, syncAllEligible covers booking; review: reschedule re-sync returns the SAME event id with the new schedule and no twin event) |
| S8-2 | Backup job writes per schedule; restore drill (see BACKUP_RECOVERY) | PASS (automated: daily backup creates Drive copy + CSV exports, metadata recorded, SyncLog OK, retention keeps KEEP_DAILY copies, verification passes with copies + CSV, off-site mirror skipped when unconfigured and creates copy when configured, missing source fails cleanly with BACKUP_FAILED, restore drill refuses non-test workbook and succeeds on initialized test workbook with audit + SyncLog rows) |
| S8-3 | Digest email delivered; low-stock alert fires | PASS (automated: recipients set and persisted, invalid recipient rejected, digest includes sync-failure sections, sendEmail delivers with validation, automation status exposes safe config only; review: low-stock section fires LOW_STOCK_ALERT_SENT audit, on-hand <= reorderLevel flagged) |
| S8-4 | No automation writes without audit | PASS (automated: every backup/digest/trigger action audited; no cash transactions or bookings created by automation; no secrets/resource IDs exposed in status or file summaries; trigger install/remove idempotent and audited; review: full automation pass writes zero cash transactions/inventory movements/payments/expenses/booking-cost rows) |
| S8-5 | Review hardening (section 55): calendar failure paths audited (CALENDAR_SYNC_FAILED, WARNING severity); digest job-level audit is DIGEST_SENT, never BACKUP_*; error-code contract includes CALENDAR_PERMISSION_DENIED | PASS (automated: 23/23 review checks green; full suite 902 passed / 0 failed) |

## 12. Sprint 9 - Production Deployment

Sprint 9 working log (2026-08-08): stabilization audit underway. Harness extended with section 56 (Sprint 9 hardening) - session-shaped actor file access, role-matrix regression, dashboard/ledger parity; full suite now **909 passed / 0 failed**. Remaining items below (S9-3 onward) require the deployed web app and are owned by the owner runtime-verification pass.

2026-08-09: Sprint 5/9 inventory hardening pass landed (real movement ids, single-read `listItems`, `getPageData` + `getItemDetailView` page-model endpoints, `recordOpeningStock` + `OPENING_STOCK_RECORDED` audit, `recordUsage` accepts `ADJUSTMENT`, `InventoryPermissionService` enforcing OWNER/ADMIN/OPERATIONS write matrix, controller guard on every mutation entry point). New `InventoryPermissionService.gs` registered in the harness load order; full suite now **942 passed / 0 failed**. Owner deployment of the controller changes pending.

| # | Check | Result |
|---|---|---|
| S9-1 | 100% of S0-S8 items pass on clean test workbook | PARTIAL - PASS (automated, 942/942 on the in-memory harness workbook) |
| S9-2 | Global invariants pass | PARTIAL - INVARIANTS co-run green (G1 ledger math, G2 void-only, G3 no hard-delete, G4 audit, G6 no Session in services, G7 header-map access, G8 numbers/dates, G10 negative stock; G5/G11 extend to deployed app) |
| S9-3 | Performance within NFR: list <1.5s, detail <2s, dashboard <2s | |
| S9-4 | Mobile pass: payment entry + deployment flow | PARTIAL - frontend mobile pass implemented 2026-08-08 (44px touch targets, 16px inputs/no iOS zoom, bottom-sheet modals with safe-area footers, sticky bottom action bar via `ensureMobileActionBars`, momentum table scrolling, `(hover: none)` sticky-hover removal, centered toasts - `src/styles.html` + `src/scripts.html`; server suite still 909/909); runtime verification on a phone requires the deployed web app |
| S9-5 | Accessibility: keyboard navigation + contrast on key screens | |
| S9-6 | Zero open P0/P1 defects | |
| S9-7 | Production workbook created per DEPLOYMENT_GUIDE | |
| S9-8 | Backup restore-in-anger drill passed | |
| S9-9 | Legacy migration reconciliation balanced | |
| S9-10 | First real booking + payment verified by owner | |
| S9-11 | Rollback plan documented | |

## 13. Financial Validation Cases

| # | Case | Expected | Fixture source |
|---|---|---|---|
| FC-1 | Partial payment | Balance = total - paid; cash = paid | FINANCIAL_RULES worked example A |
| FC-2 | Full payment | Balance = 0; cash = total | same |
| FC-3 | Overpayment | Blocked or flagged; never negative balance silently | FINANCIAL_RULES overpayment note |
| FC-4 | Refund | REFUND transaction; payment REFUNDED; balance restored | refund example |
| FC-5 | Cash transfer | Both sides; total unchanged; no income | transfer rule |
| FC-6 | Owner capital | Cash up; not revenue | owner funds rule |
| FC-7 | Owner withdrawal | Cash down; not expense | owner funds rule |
| FC-8 | Inventory purchase + usage | Stock up; material cost on use only | weighted average example |
| FC-9 | Returned deployment stock | STOCK_RETURN restores batch; consumed only is cost | deployment example |
| FC-10 | Direct event cost | BookingCosts updated; profit recalculated | booking profitability |
| FC-11 | Gross profit | revenue - direct = gross | profitability formula |
| FC-12 | Net income | gross - operating = net | income statement |
| FC-13 | Daily cash difference | system vs actual; ADJUSTMENT path | daily reconciliation |

## 14. Test Categories Reference

- Unit-level logic tests (S1+): sequences, validation, state machines, balance math.
- Manual interface tests: workflows per `docs/BUSINESS_WORKFLOWS.md`.
- Financial validation tests: FC-1..FC-13.
- Permission tests: every role x every action per `docs/ROLE_PERMISSIONS.md`.
- Concurrent-edit tests: LockService paths, double-submit.
- Duplicate submission tests: idempotency keys on money ops.
- Mobile tests: 375px and 768px viewports.
- Accessibility tests: keyboard nav, focus, contrast, reduced motion.
- Performance tests: response budgets per NFR.
- Deployment tests: clasp push, web app version, rollback.
- Regression tests: G1-G11 each sprint.
- Data recovery tests: restore drills per `docs/BACKUP_RECOVERY.md`.

## 15. Defect Severity

| Severity | Definition | Release policy |
|---|---|---|
| P0 | Money wrong, data loss, security breach | Block; fix immediately |
| P1 | Core workflow broken | Block release |
| P2 | Secondary flow broken with workaround | Fix within one sprint |
| P3 | Cosmetic | Backlog |

## 16. Cross-References

- Fixtures: `docs/FINANCIAL_RULES.md`, `docs/REPORT_DEFINITIONS.md`
- Workflows: `docs/BUSINESS_WORKFLOWS.md`
- DoD: `AGENTS.md`
- Environment: `docs/DEPLOYMENT_GUIDE.md`
- Restore drills: `docs/BACKUP_RECOVERY.md`
