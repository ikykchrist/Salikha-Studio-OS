# BUSINESS_WORKFLOWS.md

## Purpose

Define the **order of business operations** — the process sequencing the system exists to serve. Workflows are the spine of the product: screens exist to serve workflows, never the other way around.

## Scope

- All primary end-to-end workflows for v1.0 modules.
- State transition diagrams (as text), actors, triggers, pre/post conditions, and side effects.
- Exception paths (cancellations, corrections, issues).

Out of scope: UI wireframes (see `DESIGN_SYSTEM.md`), data definitions (see `DATABASE_SCHEMA.md`), money rules (see `FINANCIAL_RULES.md`).

## Overview

The core business loop:

```
Lead → Client → Booking → Production → Deployment → Reconciliation → Payment(s) → Profit → Reports
             ↘                                      ↘ (material usage) → Inventory
```

Every workflow below enforces the state enums from `DATABASE_SCHEMA.md §11` and must respect `FINANCIAL_RULES.md` — especially the rule that **cash never derives from bookings**.

---

## Table of Contents

1. [Workflow Notation](#1-workflow-notation)
2. [WF-1 Lead to Client](#2-wf-1-lead-to-client-sprint-2)
3. [WF-2 Booking Lifecycle](#3-wf-2-booking-lifecycle)
4. [WF-3 Payment & Cash In](#4-wf-3-payment--cash-in)
5. [WF-4 Production & Deployment](#5-wf-4-production--deployment)
6. [WF-5 Return & Reconciliation](#6-wf-5-return--reconciliation)
7. [WF-6 Expense & Cash Out](#7-wf-6-expense--cash-out)
8. [WF-7 Purchasing & Stock Receipt](#8-wf-7-purchasing--stock-receipt)
9. [WF-8 Cancellations & Refunds](#9-wf-8-cancellations--refunds)
10. [WF-9 Corrections & Adjustments](#10-wf-9-corrections--adjustments)
11. [WF-11 Equipment Maintenance](#11-wf-11-equipment-maintenance)
12. [WF-12 Partner Commission Settlement](#12-wf-12-partner-commission-settlement)
13. [WF-13 Daily Cash Reconciliation](#13-wf-13-daily-cash-reconciliation)
14. [WF-14 Periodic Close](#14-wf-14-periodic-close)
15. [Actor/Module Matrix](#15-actormodule-matrix)
16. [Cross-References](#16-cross-references)

---

## 1. Workflow Notation

```
[State] --action--> [State]        transition
(trigger)                           condition that fires an action
[pre] / [post]                      conditions that must hold / become true
-> side effect                       consequences of the transition (audit, transactions, notifications)
```

Every transition:
- Is **enforced in the backend** (never trusting the frontend).
- Writes an **audit entry** (`AuditLogs`).
- Runs within **one request** when multiple records must change (atomicity).

---

## 2. WF-1 Lead to Client (Sprint 2)

### Flow
```
[LEAD: NEW] --contact--> [CONTACTED]
[CONTACTED] --qualify--> [QUALIFIED]
[QUALIFIED] --quote--> [QUOTED]
[QUOTED] --follow up--> [FOLLOW_UP]
[FOLLOW_UP] --negotiate--> [NEGOTIATING]
[NEGOTIATING] --convert--> [WON]  (conversion: link to an existing client OR create a new client from the lead)
[any active] --lost (reason required)--> [LOST]
[any] --archive--> [ARCHIVED] --reopen (reason required)--> [NEW]
```

### Business rules
- Forward movement within the main chain is allowed, including skips. `WON` is reachable **only through conversion** - never through a status edit.
- `LOST` requires a lost reason; reopening a `LOST` or `ARCHIVED` lead requires a recorded reason.
- Conversion is atomic under a script lock: it links to an existing client or creates a new one (with duplicate detection), preserves the lead record, sets `WON` + `converted_client_id` + `converted_at`, and writes audit entries.
- **Conversion never creates a booking in Sprint 2.** Booking creation from a won lead arrives in Sprint 3.
- A converted lead cannot be converted again.
- Every status change is audited (`LEAD_STATUS_CHANGED`, `LEAD_CONVERTED`).

### Example
```
Lead "Maria Santos" (Facebook, premium photobooth interest) → CONTACTED → QUALIFIED
→ owner clicks "Convert to client" → new client created from lead → lead WON with converted_client_id.
No booking is created.
```

---

## 3. WF-2 Booking Lifecycle (Sprint 3)

### States & transitions
```
[INQUIRY] --confirm/advance--> [TENTATIVE] --confirm--> [CONFIRMED]
[CONFIRMED] --complete (event passed or override)--> [COMPLETED] --archive--> [ARCHIVED]
[INQUIRY / TENTATIVE / CONFIRMED] --cancel (reason required)--> [CANCELLED]
[CANCELLED / ARCHIVED] --reactivate (reason required)--> [TENTATIVE]
PREPARING / READY / IN_PROGRESS: reserved for operations sprints
```

### Pre/post conditions
| Transition | Pre | Post / side effects |
|---|---|---|
| Confirm | client active, event date present, total valid | Status CONFIRMED; receivable recognized (gross - payments, see FINANCIAL_RULES §4) |
| Complete | event date passed, or override reason | Status COMPLETED; completed_at set |
| Cancel | reason required | Status CANCELLED + reason; payments and history preserved; refund review flagged when paid; balance NOT auto-zeroed |
| Archive / Reactivate | reason for reactivation | History preserved |

### Business rules
- Pricing is edited server-side only; package/add-on snapshots are never rewritten by later catalog edits.
- Booking creation never posts cash. Every posted payment creates one `BOOKING_PAYMENT` inflow.
- Payment status (UNPAID/PARTIALLY_PAID/PAID/OVERPAID/REFUNDED/VOIDED) is server-computed, never manually set.
- Cancellation preserves payments; refunds follow WF-8 and never auto-delete or auto-refund.

---

## 4. WF-3 Payment & Cash In (Sprint 3)

### Flow
```
[PAYMENT: POSTED]  (created atomically with a PaymentAllocation + a linked BOOKING_PAYMENT cash inflow)
   -> side effects (single request under one lock):
       - CashTransactions: BOOKING_PAYMENT +amount on chosen account (INFLOW)
       - PaymentAllocations: allocated_amount row
       - Bookings: amount_paid_cached, balance_due_cached, payment_status recomputed
       - Clients: cached totals refreshed
       - audit entry
[PAYMENT: POSTED] --void (reason required)--> [PAYMENT: VOIDED]  (linked cash transaction voided together)
[PAYMENT: POSTED] --refund (amount <= refundable)--> [PARTIALLY_REFUNDED | REFUNDED]  (REFUND cash outflow)
```

### Business rules
- Duplicate idempotency keys never double-post.
- Overpayments require explicit confirmation (PAYMENT_OVERPAYMENT_OVERRIDE audit).
- Voiding a payment voiding its ledger link; direct ledger voids of payment transactions are routed back to the payment workflow.
- Refunds are separate cash outflows, never operating expenses.

### Example
```
BK-2026-0042 gross 6,100. Down payment 2,000 to GCash → GCash +2,000; balance 4,100.
Second payment 1,500 to Cash on Hand → balance 2,600; payment status PARTIALLY_PAID.
Void the second payment → Cash on Hand restored; balance 4,100.
```

---

## 5. WF-4 Production & Deployment

### Flow
```
[BOOKING: CONFIRMED] --plan event--> [PRODUCTION tasks created via Tasks]
[Tasks] --production task done (per item)--> (task progress)
[Tasks] --all required done + crew assigned--> [readyToDeploy = true]
--auto: create EventDeployments (PLANNED) with materials (projected from services) + equipment list + checklist from template
[DEPLOYMENT: PLANNED] --start loading--> [DEPLOYMENT: LOADING]   (loadedQty captured)
[DEPLOYMENT: LOADING] --depart--> [DEPLOYMENT: IN_PROGRESS]       (crew sign-in, incidents logging)
[DEPLOYMENT: IN_PROGRESS] --return--> [DEPLOYMENT: RETURNED]      (returnedQty captured; crew sign-off required)
```

### Business rules
- Deployment creation is **automatic** and mandatory for every booking at production fire.
- `loadedQty` defaults to `projectedQty` but is editable during LOADING only.
- Crew members sign off individually (`DeploymentCrew.signed`); a deployment cannot move to RETURNED with unsignoffed crew (configurable hard rule — see Settings).

### Side effects
- Every material row written at LOADING (projected → loaded).
- Equipment rows written at LOADING (per `DeploymentEquipment`).

---

## 6. WF-5 Return & Reconciliation

```
[DEPLOYMENT: RETURNED] --reconcile--> [DEPLOYMENT: RECONCILED]
   - crew sign-offs validated (all present)
   - checklist completeness validated
   - material usage: consumedQty = loadedQty − returnedQty (per item)
   - inventory: STOCK_USAGE (consumed) + STOCK_RETURN (returned) movements written
   - deployment.actualMaterialCost computed (consumed × unit cost at batch)
   - BookingCosts.costMaterial updated → profitability recalculated
   - incidents resolved/flagged; damage to equipment logged (condition per item)
[DEPLOYMENT: RECONCILED] --close--> [DEPLOYMENT: CLOSED]  (final sign-off; files attached)
```

### Business rules
- RECONCILED cannot be reached with outstanding required checklist items.
- Consumption **cannot be edited** after RECONCILED — corrections are new inventory adjustments (WF-9).
- Negative stock is prevented: if consumed would exceed on-hand, block with clear error → requires purchase/adjustment first.
- Unused returned materials return to batches at their original unit cost (STOCK_RETURN).

### Example
```
Deployment DEP-00022: loaded 10 print-paper packs, returned 4 unused, consumed 6 @ P120 = P720 actualMaterialCost.
Inventory: STOCK_USAGE 6, STOCK_RETURN 4. Booking BK-2026-0015 costMaterial = 720.
```

---

## 7. WF-6 Expense & Cash Out

### Flow
```
[DRAFT] --submit--> [SUBMITTED] --approve (Owner/Admin)--> [APPROVED] | [REJECTED]
[APPROVED] --pay (from account)--> [PAID]
   -> side effects (atomic):
        - TX created: EXPENSE −amount on chosen account
        - if bookingId set (DIRECT): BookingCosts.cost* bucket updated → recalc
        - receipt file optional
```

### Business rules
- Only `PAID` expenses create cash outflow.
- Direct costs must tag a booking; capital items (equipment) use the Equipment flow instead (see WF-7/Purchase and FINANCIAL_RULES §11).
- Crew pay and partner commissions flow through their own records but always land as `EXPENSE` cash transactions.

---

## 8. WF-7 Purchasing & Stock Receipt

```
[DRAFT PO] --place order--> [ORDERED]
[ORDERED] --partial receive--> [PARTIAL_RECEIVED] (batch created per received line)
[ORDERED/PARTIAL_RECEIVED] --full receive--> [RECEIVED]
[any] --cancel--> [CANCELLED] (reason)
```

### Side effects on receipt
- Each received line creates `InventoryBatches` (qtyIn, unitCost, landingCost prorated) + `InventoryMovements` STOCK_IN.
- Equipment lines create/update `Equipment` registry records.
- Payment of the PO invoice happens via WF-6 (expense) or direct payable — linked by `poId`.

### Rules
- PO totals are informational until receipt; no expense until paid.

---

## 9. WF-8 Cancellations & Refunds

### Booking cancellation
```
[BOOKING: any non-cancelled] --cancel (reason)--> [BOOKING: CANCELLED]
  - if any VERIFIED payments exist → refund workflow MUST be resolved first or concurrently
  - booking plan lines status → VOIDED (unpaid) / paid lines untouched
```

### Refund flow
```
[PAYMENT: VERIFIED] --refund (amount ≤ paid)--> [PAYMENT: REFUNDED]
  -> side effects (atomic):
       - Refunds row created
       - TX created: REFUND −amount (same account as original payment, or chosen)
       - booking balance restored (receivable increases)
       - audit
```

### Business rules
- Partial refunds allowed; remaining balance tracked per payment via `Refunds.amount` sum.
- Refund never touches the original VERIFIED transaction — it creates a new one (immutability, FINANCIAL_RULES §15).

---

## 10. WF-9 Corrections & Adjustments

- **Missed cash split** → `ADJUSTMENT` with memo, or void+recreate.
- **Wrong inventory usage** → inventory `ADJUSTMENT` with source `CORRECTION`, never edit the RECONCILED deployment; a new adjustment movement corrects stock; booking cost re-calculated on next recalc event.
- **Wrong booking price after confirm** → amendment: create a `voided` booking row and a new booking, or record an amendment line (future). Both preserve audit.
- Every correction writes an audit entry with before/after.

---

## 11. WF-11 Equipment Maintenance

### Trigger
- Equipment condition reported as FAIR/DAMAGED at deployment return.
- Scheduled maintenance is due (interval per equipment record, Sprint 5+).

### Preconditions
- Equipment exists and is tracked (`Equipment`).
- For post-deployment damage: the deployment is at least `RETURNED`.

### Steps
1. Log an `EquipmentMovements` row with `movementType = MAINTENANCE` or `REPAIR` (or `WRITE_OFF` for beyond repair).
2. Capture condition before/after, notes, cost, performed-by, date.
3. If the item is damaged during an event, link the movement to the `EventDeployments` record.
4. Update `Equipment.status` (`IN_SERVICE` / `OUT_OF_SERVICE` / `WRITTEN_OFF`) as appropriate.

### Statuses
`Equipment.status`: `IN_SERVICE`, `OUT_OF_SERVICE`, `SOLD`, `WRITTEN_OFF`.
`EquipmentMovements.movementType`: `ASSIGN`, `RETURN`, `MAINTENANCE`, `REPAIR`, `SALE`, `WRITE_OFF`.

### Validation
- Maintenance cost must be a non-negative amount.
- A `WRITE_OFF` requires a reason in notes.

### Failure cases
- Equipment under repair must not be assigned to new deployments (blocked by status check).

### Audit requirements
- Every maintenance movement and status change writes an audit entry.

### Completion condition
- Movement logged, status updated, audit written. Costs are capital/report-only; no cash transaction is created by maintenance itself (payment, if any, flows through WF-6).

---

## 12. WF-12 Partner Commission Settlement

### Trigger
- A booking involving a partner with a commission rate is confirmed.

### Preconditions
- Partner is active; `commissionRatePct` is set on the partner or booking record.

### Steps
1. At booking confirmation, create a `PartnerCommissions` row: bookingId, partnerId, baseAmount, ratePct, commissionAmount (base x rate / 100), status `PENDING`.
2. When the receivable is collected or the event completes (policy: on booking completion), advance status to `DUE`.
3. On payment to the partner: create the `CrewPayments`-style payment or expense flow — a `EXPENSE` cash transaction with counterparty `PARTNER` — and mark the commission `PAID`, linking `cashTransactionId`.

### Statuses
`PartnerCommissions.status`: `PENDING`, `DUE`, `PAID`.

### Validation
- Commission amount must be non-negative and rate within 0-100.
- `PAID` requires a linked cash transaction.

### Failure cases
- Cancelled bookings: commission row is voided (soft) - never paid.
- Duplicate settlement prevented by idempotency key on the payment.

### Audit requirements
- Creation, status transitions, and settlement are audited.

### Completion condition
- Commission `PAID` with a VERIFIED cash `EXPENSE` transaction; booking direct cost includes the commission (BookingCosts.costCommission).

---

## 13. WF-13 Daily Cash Reconciliation

### Trigger
- End of business day (or next morning) per account; Owner/Finance responsibility.

### Preconditions
- All day's payment verifications and expense payments are `VERIFIED`/`PAID`.

### Steps
1. Read computed system closing balance for the account/date (R15 in `REPORT_DEFINITIONS.md`).
2. Record the actual closing from bank app, wallet, or cash count.
3. Create a `DailyCashReconciliations` row: date, account, systemClosing, actualClosing, difference, notes.
4. If difference > 0: investigate; when unexplained, record an `ADJUSTMENT` cash transaction with memo and reason (owner approval required).

### Statuses
`DailyCashReconciliations` is a record sheet (no status enum); differences are resolved via `ADJUSTMENT` transactions.

### Validation
- One row per account per day (unique on date + accountId).
- Difference = actualClosing - systemClosing.

### Failure cases
- Unreconciled days are flagged on the dashboard ("Needs Attention").

### Audit requirements
- Reconciliation creation and any adjustment transaction are audited.

### Completion condition
- Row saved and difference either zero or covered by an approved `ADJUSTMENT`.

---

## 14. WF-14 Periodic Close

Intended cadence: **monthly**, plus optional daily cash check.

```
1. Reconcile each cash account to bank statements (ADJUSTMENT for diffs)
2. Verify all payments VERIFIED (no orphan RECORDED > 7 days → flag)
3. Approve/close pending expenses
4. Reconcile open deployments (all RECONCILED/CLOSED)
5. Stock take → ADJUSTMENTs
6. Run month-end reports (REPORT_DEFINITIONS) and store snapshots in Files
7. Record close audit entry; mark period closed in Settings (optional hard close)
```

### Rules
- After a hard close, only corrections with explicit `OWNER` approval are allowed in that period.
- Closed periods are never reopened — corrections go into the current period.

---

## 15. Actor/Module Matrix

| Workflow | Actor | Module |
|---|---|---|
| WF-1 Lead conversion | Owner / Operations | Leads, Clients |
| WF-2 Booking lifecycle | Owner / Operations | Bookings |
| WF-3 Payments | Finance | Payments, Cashflow |
| WF-4 Production/Deployment | Operations, Crew | Production, Deployments |
| WF-5 Reconciliation | Crew, Owner | Deployments, Inventory |
| WF-6 Expenses | Finance, Owner | Expenses |
| WF-7 Purchasing | Finance, Operations | Purchasing, Inventory |
| WF-8 Refunds | Owner / Finance | Payments, Refunds |
| WF-9 Corrections | Finance / Owner | Cashflow, Inventory |
| WF-11 Equipment maintenance | Operations | Equipment |
| WF-12 Commission settlement | Finance / Owner | Partners |
| WF-13 Daily cash reconciliation | Finance / Owner | Cashflow |
| WF-14 Close | Owner, Finance | Reports, Files |

Permission details: `docs/ROLE_PERMISSIONS.md`.

---

## 16. Cross-References

- States & enums: `docs/DATABASE_SCHEMA.md §11`
- Money rules for every WF: `docs/FINANCIAL_RULES.md`
- Screens these WFs drive: `docs/PRODUCT_REQUIREMENTS.md`
- Report outputs at close: `docs/REPORT_DEFINITIONS.md`
- Audit for every transition: `docs/SECURITY_MODEL.md`
- UI behavior of transitions (confirm dialogs, undo): `docs/DESIGN_SYSTEM.md`