# FINANCIAL_RULES.md

> The financial constitution of Salikha Studio OS.

## Purpose

Define every money concept, accounting rule, and financial invariant that the system must enforce. This document **overrides all others** when conflicts arise (see `AGENTS.md` resolution order). It exists so the books are always right, auditable, and never "reconstituted from bookings."

## Scope

- Applies to every feature that touches money: payments, cashflow, expenses, refunds, inventory valuation, equipment, crew, commissions, reports.
- Applies to every report that outputs money; each must state its transaction scope.
- Does **not** attempt to replace the services of a certified accountant — it sets the rules the system enforces and documents where a professional accountant must review.

## Overview

The cash ledger is the source of truth. All money movement exists as **cash transactions** keyed to an account. Booking totals are **revenue commitments, not cash**. This section defines every financial object, its timing, books, and the effects each has on cash, receivables, payables, inventory, and profit.

---

## Table of Contents

1. [Financial Invariants](#1-financial-invariants)
2. [Money Concepts](#2-money-concepts)
3. [Accounts & Ledger](#3-accounts--ledger)
4. [Revenue and Receivables](#4-revenue-and-receivables)
5. [Payments](#5-payments)
6. [Expenses and Payables](#6-expenses-and-payables)
7. [Owner Capital & Withdrawals](#7-owner-capital--withdrawals)
8. [Transfers](#8-transfers)
9. [Refunds & Adjustments](#9-refunds--adjustments)
10. [Inventory Accounting](#10-inventory-accounting)
11. [Equipment & Capital Expenses](#11-equipment--capital-expenses)
12. [Costs against a Booking](#12-costs-against-a-booking)
13. [Profitability of a Booking](#13-profitability-of-a-booking)
14. [Net Profit / Income Statement](#14-net-profit--income-statement)
15. [Transaction Lifecycle & Immutability](#15-transaction-lifecycle--immutability)
16. [Worked Examples](#16-worked-examples)
17. [Report Scope Requirements](#17-report-scope-requirements)
18. [Best Practices & Controls](#18-best-practices--controls)
19. [Future Expansion](#19-future-expansion)
20. [Cross-References](#20-cross-references)

---

## 1. Financial Invariants

Absolute. Violations are system-breaking defects.

1. **Cash balance = Σ verified cash transaction amounts.** Never Σ bookings, expenses, or receivables.
2. `CAPITAL_IN` and `WITHDRAWAL` are owner-fund movements — never revenue or expense.
3. **Transfers are dual-sided**, non-income movements between cash accounts.
4. **Inventory purchase → stock value. Inventory usage → direct event cost.** Never the reverse.
5. **Equipment purchase → capital asset**, depreciated per policy — never operating expense.
6. **Every cash transaction is immutable once VERIFIED.** Corrections via reversal + new transaction.
7. **Financial records are never physically deleted** — void/reverse.
8. Every report that reports money states which transaction types it includes and its date filter.
9. Negative stock cannot occur; the system prevents inventory movement that would push on-hand below zero.
10. Every money mutation is audited (who, when, value before/after).

---

## 2. Money Concepts

| Concept | Definition | Cash effect |
|---|---|---|
| **Cash account** | A real account where the business holds money (bank, wallet, petty cash). | — |
| **Cash transaction** | A single money flow into/out of an account (the source of truth). | immutably changes balance |
| **Receivable** | Money owed to the business from a booking (unpaid balance). | accounting concept; no cash until paid |
| **Payable** | Money the business owes (approved expenses, supplier POs). | accounting concept; no cash until paid |
| **Gross profit** | Revenue − direct costs of a booking. | informational |
| **Net profit** | Gross profit − allocated operating costs per booking; business-level: cash-based business earnings. | informational |
| **Capital** | Money/in-kind contributed by owner, or withdrawn. | owner equity, not P&L |
| **Direct cost** | A cost that exists because a specific booking exists. | expense at the right moment |
| **Operating cost** | A cost that exists to run the business regardless of bookings. | expense when paid |
| **Capital expense** | An asset purchased for long-term use (equipment). | capitalized |

---

## 3. Accounts & Ledger

### 3.1 Cash accounts
- Recorded in `CashAccounts`. Each has `openingBalance` (informational), `openingBalanceDate`, and `currentBalanceCached` (performance cache only).
- Current `balance` = **Σ posted transaction amounts** (signed by direction) — the ledger is authoritative. The opening balance itself is an `OPENING_BALANCE` transaction, so the ledger sum is complete.
- A **transfer** moves value between accounts; it creates two linked transactions `TRANSFER_OUT` (source) and `TRANSFER_IN` (destination) sharing a `transfer_group_id`, written atomically under one lock.

### 3.2 The ledger
- Every financial event eventually produces **one cash transaction** (or a pair).
- Sprint 1 statuses: `POSTED` (counts toward balances) and `VOIDED` (never counts, always visible). The `VERIFIED`/`PENDING`/`REVERSED` vocabulary arrives with booking payments in a later sprint.
- Sprint 3 transaction types (full set):

| Type | Direction | Books |
|---|---|---|
| `GENERAL_INCOME` | INFLOW | business income |
| `OPERATING_EXPENSE` | OUTFLOW | business expense |
| `CAPITAL_EXPENSE` | OUTFLOW | capital asset purchase (separate from operating expense) |
| `OWNER_CAPITAL` | INFLOW | owner equity |
| `OWNER_WITHDRAWAL` | OUTFLOW | owner equity (draw) |
| `TRANSFER_IN` / `TRANSFER_OUT` | ± | neutral (account move) |
| `OPENING_BALANCE` | INFLOW | initial cash (not revenue) |
| `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | ± | corrections / rounding |
| `BOOKING_PAYMENT` | INFLOW | booking revenue (system category "Client Booking Payment", INCOME) |
| `REFUND` | OUTFLOW | returns (system category "Client Refund", REFUND) - never an operating expense |

### 3.3 Which report reads which
See `docs/REPORT_DEFINITIONS.md` — relationship must be transparent. The Sprint 1 finance summary is labeled "Operational result — preliminary": it reports cash movement, never full business profit.

---

## 4. Revenue and Receivables

- **Revenue is recognized** per booking services at the agreed price/when confirming a booking (accrual of receivables), while **cash is recognized on the ledger** at the time the money arrives.
- A booking has `revenueTotal` and a running `balanceRemaining` driven only by *recorded payments* — not by editing booking amounts. The two must always reconcile: `balanceRemaining` = Σ plan dues − Σ VERIFIED payments applied.
- No booking may show revenue cash inflow without a matching VERIFIED payment.
- Revenue is recognized for a booking on confirmation (it becomes a receivable); cash is recognized at the moment a payment is `VERIFIED`. Pre-payments on a DRAFT booking are allowed but held as deposits until confirmation.

---

## 5. Payments

The only way money flows *in* for a booking.

- Payment lifecycle: `DRAFT → RECORDED → VERIFIED | FAILED → REFUNDED`.
- `RECORDED` = we know a receipt; it does **not** touch cash.
- `VERIFIED` = performed — at that point the system:
  - Marks the payment VERIFIED and applies it to the booking payment plan (updates `Bookings.balanceRemaining`);
  - Creates **one `INCOME` cash transaction** (with `counterpartyType=PAYMENT`, ref `paymentId`);
  - Writes the audit entry (see `SECURITY_MODEL.md`).
- The `INCOME` transaction and the booking balance update happen **atomically in the same request** — no chance of divergence.
- `FAILED` → payment rejected; does nothing to balances. Money entry must be re-input or voided.
- **Refund** of a verified payment: mark payment `REFUNDED`, create a `REFUND` (out) cash transaction, and reduce the booking balance — all in one request (see §9).

**Example:**
```
Booking BK-2026-0042 totals 20,000. Deposit plan 5,000 due 15 Jan.
15 Jan: payment PAY-001 for 5,000 RECORDED → cash unchanged. Booking balanceRemaining = 15,000.
18 Jan: finance staff VERIFIES PAY-001 → balanceRemaining = 10,000; TX +5,000 INCOME (account GCash).
```

---

## 6. Expenses and Payables

- An expense is captured, then routed: `DRAFT → SUBMITTED → APPROVED | REJECTED → PAID`.
- Only `PAID` expenses mint **one `EXPENSE` cash transaction** (out) and decrement the relevant account.
- `netAmount` (gross − tax) is the expense on the books; tax is handled per `Settings.TAX_RATE`.
- A payable is recognized when an expense is approved and not yet paid; v1.0 tracks payables implicitly through the `Expenses.approvalStatus` pipeline (approved ≠ paid), with the PO module as the explicit procurement record.
- Direct costs (see §12) must tag `bookingId` when the source is a booking.

---

## 7. Owner Capital & Withdrawals

- Money the owner injects or withdraws is **equity**, never revenue/expense.
- No P&L impact. Both are reported in the "Cashflow Report" and "Owner Equity" section, not the Income Statement.
- Requires explicit `memo` and (optional) approval role = OWNER only (see `ROLE_PERMISSIONS.md`).

---

## 8. Transfers

- Link `TRANSFER_OUT` (from) + `TRANSFER_IN` (to) with a **shared `transferRef`**.
- Does not affect total cash (net Σ across all accounts is unchanged).
- Must be approved by `OWNER`/`FINANCE` (see `docs/ROLE_PERMISSIONS.md`).

---

## 9. Refunds & Adjustments

### 9.1 Refund
- Apply only against a `VERIFIED` payment; mark it `REFUNDED`.
- Create `REFUND` (out) cash transaction (`counterpartyType=PAYMENT`, ref refund).
- Reconfigure booking balance.

### 9.2 Adjustment
- For corrections (split transaction, bank fees, rounding).
- Always a `memo`, and `adjustmentReason`.
- An adjustment row is a new transaction; never edit an old row.
- `ADJUSTMENT` automatically sets `status VOIDED` on the erroneous original (see §15).

---

## 10. Inventory Accounting

### Domain mapping
| Inventory event | Financial effect | Book entry |
|---|---|---|
| Purchase / receipt | Inventory asset increases | `InventoryMovements` STOCK_IN; no expense; value sits in Inventory |
| Usage at an event | Inventory asset → event direct cost | `STOCK_USAGE` → cost on deployment → booking direct cost material |
| Return from event (unused) | reversal of usage | `STOCK_RETURN`, reassign to batch |
| Stock take adjustment | physical diff → adjustment | `ADJUSTMENT` (asset ±), never to booking |
| Write-off (damage/job) | loss | `WRITE_OFF` (may be operating expense if policy) |

### Valuation rules
- Default cost method: **weighted average** per item (see §14 of `DATABASE_SCHEMA.md`).
- Batch cost = `unitCost × qtyIn` (includes `landingCost` prorated, if any).
- On-hand qty = Σ `remainingQty` on **active** (unexpired) batches.
- **Never book a direct event cost from inventory until usage is reconciled** — until the deployment `RECONCILED`.
- A material cost goes to a booking only when consumed: `consumedQty × unitCost`.

**Example:**
```
Item: AAA Battery 20-pack. Batch1: 100 @ P18. Batch2: 50×P16 → weighted avg = (1800+800)/150 = P17.33.
Event uses 5 → material cost 5×17.33 = P86.67 → deployment.actualMaterialCost; stock on-hand 150−5=145.
```

---

## 11. Equipment & Capital Expenses

- Equipment purchases are recorded in `Equipment` registry, not Expenses.
- They are NOT operating expenses. They are capitalized; depreciation policy: **straight-line**, `usefulLifeMonths` default 36, residual 0.
- Monthly depreciation = `purchasePrice / usefulLifeMonths`; is **informational** for reports (`Asset Depreciation` line) and does **NOT** generate cash transactions.
- Equipment sale/disposal: record `WRITE_OFF`/gain as an `ADJUSTMENT`, consult accountant.
- The `Equipment` purchase itself follows the standard `EXPENSE`-to-supplier booking; it decreases cash but shows as `capital expenditure` in cash flow, not `operating expense` in P&L.

---

## 12. Costs Against a Booking (Direct Costs)

Direct costs exist only if the booking exists:

- **Material cost** — from deployment reconciliation (usage × unit cost). Set at `RECONCILED`.
- **Transportation** — transportation category cost linked to booking.
- **Meals** — crew meals linked to booking.
- **Crew cost** — assignment pay. **Captured when paid as `CrewPayment`**, and booked to P&L at accrual? **Policy: cost at `CrewPayment` pay** + as payable. The booking's `costCrew` reads from assigned/paid assignments.
- **Commission** — partner commission payable (see `PartnerCommissions`).

Other direct items go through `Expenses` with `costType=DIRECT`.

**Operating cost allocation** (business overhead): policy allocation = **revenue share** for the period:

```
alloc = operatingExpenses(period) × (bookingRevenue / totalRevenue(period))
```

The period is the booking's event month. This may be user-toggled in settings; when disabled, `allocOpsCost = 0`.

---

## 13. Profitability of a Booking

```
revenueTotal            Σ lineTotal − discount + tax
directCostTotal         costMaterial + costTransport + costMeals + costCrew + costCommission + costOtherDirect
grossProfit             revenueTotal − directCostTotal
allocOpsCost            per policy (§12)
netProfit               grossProfit − allocOpsCost
profitMarginPct         netProfit / revenueTotal × 100
```

All stored on the `BookingCosts` snapshot (recalc on every cost-bucket/cash control change). See `docs/DATABASE_SCHEMA.md §5.3 BookingCosts`.

---

## 14. Net Profit / P&L (Business Level)

At business (not booking) level:

```
Income Statement (accrual view)
───────────────────────────────
Revenue (recognized)          Σ booking revenueTotal (in period)
− Direct costs (per booking)  Σ directCostTotal
= Gross profit               
− Operating expenses (ORB)    Σ approved&paid EXPENSE where costType=OPERATING + periods allocated
= Net profit (accrual)       
```

Supplemental cash flows (from CashTransactions):
```
Cash in  = Σ INCOME + CAPITAL_IN + TRANSFER_IN + refunds out adjustments +
Cash out = Σ EXPENSE + WITHDRAWAL + REFUND + TRANSFER_OUT
```

> Depreciation is report informational only. Inventory valuation is a note.

---

## 15. Transaction Lifecycle & Immutability

1. Create → `status=PENDING` (can still edit/change).
2. Verify → `status=VERIFIED` — **immutable**. Under no circumstance is a VERIFIED transaction edited or deleted.
3. Correction needed → `VOID` the original (with `voidReason`), then **create a new transaction** for the correct value. Optionally link via `reverseOfTxId`.
4. `VOIDED` rows stay in place forever (ledger history).
5. Batch day-closing (optional): run daily summary + reconciliation.

---

## 16. Worked Examples

### Example A — Deposit & final payment
```
Booking total 50,000. Deposit 10,000. 
- Booking CONFIRMED (balance receivable = 50,000 / plan due = 10k + 40k).
- Deposit PAY VERIFIED → TX INCOME 10,000 (balance 0 on single-default account) → balance remains 40,000.
- Final PAY VERIFIED 40,000 → TX INCOME 40,000 → balance 0, paid 50,000.
No booking edit made cash. 
```

### Example B — Equipment, not expense
```
Buy camera 120,000 mid-July.
- Expense record `PO`→SUPPLIER; cash: EXPENSE **capital** (or OP_PURCHASE) TX −120,000.
- Equipment registered 120,000, useful life 36.
- July depreciation note 120,000/36 = 3,333 (report only, no cash).
```

### Example C — refund
```
Booking 30,000 paid 30,000. Client cancels; refund full.
- Refund REFUND 30,000 (out).
- Payment REFUNDED; booking balance stays 30,000 (paid-out recoverable) → repost.
```

---

## 17. Report Scope Requirements

Every report that mentions a money figure must state (in the report header or this doc):

- **Date range** (txDate basis)
- **Which transaction types** are included (from §3.2)
- **Approval status filter** (VERIFIED only, etc.)
- **Cut off** (e.g., "balances as of a point in time")

The matching from report list: `docs/REPORT_DEFINITIONS.md`.

---

## 18. Best Practices & Controls

1. **Weekly reconciliation** — owner compares cash ledger to bank app per account; discrepancy → `ADJUSTMENT` with memo.
2. **Separation of duties**: capturing ≠ approving ≠ verifying; enforced via roles.
3. **No round numbers guessing**: every `memo` written.
4. **Backup daily** — see `docs/BACKUP_RECOVERY.md`.
5. **Balances are never stored** as truth; they are computed (see §14 `DATABASE_SCHEMA`).
6. **Test with hand examples** from §16 before any release (see `docs/TESTING_CHECKLIST.md`).

---

## 19. Future Expansion

- Double-entry general journal (this conforms on a single-entity basis; an accountant may recommend splitting).
- Payroll automation for crew.
- Multiple currencies with FX handling (multi-currency = future flag).
- Tax integration (VAT reporting/PHP BIR).
- Subscription/retainer revenue.

---

## 20. Cross-References

- Money storage: `docs/DATABASE_SCHEMA.md §8`
- What financial events fire: `docs/BUSINESS_WORKFLOWS.md`
- Money reports: `docs/REPORT_DEFINITIONS.md`
- Number formatting, currency: `docs/DESIGN_SYSTEM.md`
- Roles: `docs/ROLE_PERMISSIONS.md`
- Audit: `docs/SECURITY_MODEL.md`
- Backup: `docs/BACKUP_RECOVERY.md`