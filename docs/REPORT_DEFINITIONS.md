# REPORT_DEFINITIONS.md

## Purpose

The canonical definition of every report in Salikha Studio OS: purpose, data source, filters, formula, included/excluded statuses, expected columns, example result, and export format. Any report output must match this document.

## Scope

- All v1.0 reports (R1-R16 below).
- Exact calculations and inclusion rules.
- Cash basis versus operational profitability distinction.

## Overview

**Master rule:** every money report states which cash transactions it includes. All use `VERIFIED` transactions only unless explicitly noted. Reports are computed by backend services; the frontend never recomputes.

---

## Table of Contents

1. [Common Conventions](#1-common-conventions)
2. [R1 Dashboard KPIs](#2-r1-dashboard-kpis)
3. [R2 Cashflow Report](#3-r2-cashflow-report)
4. [R3 Income Statement](#4-r3-income-statement)
5. [R4 Accounts Receivable](#5-r4-accounts-receivable)
6. [R5 Revenue by Service](#6-r5-revenue-by-service)
7. [R6 Revenue by Package](#7-r6-revenue-by-package)
8. [R7 Booking Profitability](#8-r7-booking-profitability)
9. [R8 Expense Breakdown](#9-r8-expense-breakdown)
10. [R9 Inventory Valuation](#10-r9-inventory-valuation)
11. [R10 Inventory Movement](#11-r10-inventory-movement)
12. [R11 Low Stock](#12-r11-low-stock)
13. [R12 Equipment Status](#13-r12-equipment-status)
14. [R13 Partner Commissions](#14-r13-partner-commissions)
15. [R14 Crew Payments](#15-r14-crew-payments)
16. [R15 Daily Cash Reconciliation](#16-r15-daily-cash-reconciliation)
17. [R16 Gross versus Net Income](#17-r16-gross-versus-net-income)
18. [Export Formats](#18-export-formats)
19. [Cross-References](#19-cross-references)

---

## 1. Common Conventions

- **Transactions included:** `VERIFIED` only. `PENDING`, `VOIDED`, `REVERSED` excluded from money figures.
- **Date basis:** cash reports use `CashTransactions.txDate`; booking reports use `Bookings.eventDate` (or booking date where stated).
- **Owner funds excluded:** `CAPITAL_IN`/`WITHDRAWAL` never appear in revenue or expenses; transfers are net-zero across accounts.
- **Currency:** PHP, numeric storage, formatting at export.
- Every export carries a header line: report name, period, as-of timestamp, scope note.

## 2. R1 - Dashboard KPIs

- **Purpose:** operational pulse; each widget deep-links to its source report.
- **Data source:** all other reports (R2, R4, R7, R11, R12, R15).
- **Filters:** as of today; 30-day window for trends.
- **Formula:** widget = underlying report formula.
- **Included:** all VERIFIED cash; all non-cancelled bookings.
- **Excluded:** PENDING/VOIDED; cancelled bookings.
- **Columns:** Available Cash (sum account balances), Outstanding Balance (R4 total), Net Income (R3 net), Upcoming Events (count, next 14 days), Needs Attention (low stock + overdue receivables + unreconciled deployments).
- **Example:** Available Cash PHP 84,500.00; Outstanding PHP 12,000.00; Net Income PHP 53,000.00 (Jul).
- **Export:** none (screen only).

## 3. R2 - Cashflow Report

- **Purpose:** money in/out per account and period; reconciliation tool.
- **Data source:** CashTransactions, CashAccounts.
- **Filters:** period (default current month), account.
- **Formula:**
  ```
  closing = opening + sum(INCOME) - sum(REFUND) - sum(EXPENSE) +- sum(ADJUSTMENT)
            + sum(TRANSFER_IN - TRANSFER_OUT) + sum(CAPITAL_IN - WITHDRAWAL)
  ```
- **Included:** VERIFIED transactions of all types (transfers and owner funds in separate sections).
- **Excluded:** PENDING, VOIDED, REVERSED.
- **Columns:** account, openingBalance, inflows, outflows, transfers net, owner funds net, closingBalance.
- **Example (BDO):** opening 10,000 + income 60,000 - expense 18,500 - refund 2,000 - withdrawal 5,000 = 44,500.
- **Export:** CSV, PDF.

## 4. R3 - Income Statement

- **Purpose:** business profitability for a period (accrual variant).
- **Data source:** Bookings + BookingCosts; Expenses (PAID, OPERATING).
- **Filters:** eventDate in period.
- **Formula:**
  ```
  Revenue (recognized)  = sum(BookingCosts.revenueTotal)
  - Direct costs        = sum(BookingCosts.directCostTotal)
  = Gross profit
  - Operating expenses  = sum(PAID expenses where costType=OPERATING, netAmount)
  = Net profit (accrual)
  ```
- **Included:** non-cancelled bookings; PAID+APPROVED operating expenses.
- **Excluded:** cancelled bookings; CAPITAL_IN/WITHDRAWAL/transfers; capital expenses.
- **Columns:** revenue, direct costs, gross profit, operating expenses, net profit.
- **Example (Jul):** 120,000 - 42,000 = 78,000 gross; - 25,000 operating = 53,000 net.
- **Export:** PDF (statement), CSV.

## 5. R4 - Accounts Receivable

- **Purpose:** money owed by clients.
- **Data source:** Bookings (balanceRemaining), Payments.
- **Filters:** balanceRemaining > 0; non-cancelled.
- **Formula:** balanceRemaining = sum(plan dues) - sum(VERIFIED payments applied).
- **Included:** VERIFIED payments only.
- **Excluded:** cancelled bookings; unverified payments.
- **Columns:** client, bookingId, event date, total, paid, balance, due date, aging bucket (current/0-30/31-60/60+).
- **Example:** Marilou Plaza, BKG-2026-5R9J8D3W, PHP 50,000 total, 10,000 paid, 40,000 balance, current.
- **Export:** CSV.
- **Note:** receivables are accrual positions, not cash.

## 6. R5 - Revenue by Service

- **Purpose:** service mix analysis.
- **Data source:** BookingItems (confirmed, non-cancelled).
- **Filters:** eventDate in period.
- **Formula:** revenue = sum(lineTotal) grouped by serviceKey; units = sum(quantity).
- **Included:** CONFIRMED+ bookings.
- **Excluded:** DRAFT, CANCELLED.
- **Columns:** serviceKey, serviceName, units, revenue, share %.
- **Example:** PHOTOBOOTH_4H, 12, PHP 84,000, 62%.
- **Export:** CSV.

## 7. R6 - Revenue by Package

- **Purpose:** package mix and average price.
- **Data source:** Bookings (packageCode snapshot), BookingItems.
- **Filters:** eventDate in period.
- **Formula:** units = booking count; revenue = sum of booking revenueTotal; avg = revenue/units.
- **Included:** CONFIRMED+ bookings.
- **Excluded:** DRAFT, CANCELLED.
- **Columns:** packageCode, packageName, units, revenue, avg price, share %.
- **Example:** WEDDING-BASIC, 4, PHP 96,000, PHP 24,000, 55%.
- **Export:** CSV.

## 8. R7 - Booking Profitability

- **Purpose:** per-booking margin.
- **Data source:** BookingCosts.
- **Filters:** period, status.
- **Formula:** gross = revenueTotal - directCostTotal; net = gross - allocOpsCost; margin% = net / revenueTotal x 100.
- **Included:** CONFIRMED through COMPLETED.
- **Excluded:** DRAFT, CANCELLED.
- **Columns:** bookingId, client, event, revenue, material, transport, meals, crew, commission, other, directTotal, gross, alloc, net, margin %.
- **Example:** BKG-2026-5R9J8D3W, revenue 40,000, direct 18,400, gross 21,600, alloc 3,200, net 18,400, 46%.
- **Export:** CSV.

## 9. R8 - Expense Breakdown

- **Purpose:** where money goes.
- **Data source:** Expenses (PAID), ExpenseCategories.
- **Filters:** period, category.
- **Formula:** net by category = sum(netAmount).
- **Included:** PAID + APPROVED.
- **Excluded:** DRAFT/SUBMITTED/REJECTED.
- **Columns:** category, count, gross, tax, net, % of total.
- **Example:** TRANSPORT, 6, PHP 9,000, 0, PHP 9,000, 36%.
- **Export:** CSV.

## 10. R9 - Inventory Valuation

- **Purpose:** stock value.
- **Data source:** InventoryBatches (remainingQty, unitCost).
- **Filters:** as of date.
- **Formula:** value(item) = sum(remainingQty x unitCost) over active batches.
- **Included:** active batches with remainingQty > 0.
- **Excluded:** fully consumed/written-off batches.
- **Columns:** item, sku, on-hand, weighted avg cost, total value.
- **Example:** AAA battery 20-pack, 145, PHP 17.33, PHP 2,512.85.
- **Export:** CSV.

## 11. R10 - Inventory Movement

- **Purpose:** stock activity ledger.
- **Data source:** InventoryMovements.
- **Filters:** period, item.
- **Formula:** running balance = previous + signed quantity.
- **Included:** all movement types.
- **Excluded:** none.
- **Columns:** date, item, movementType, source, qty, unitCost, value, running balance.
- **Example:** Jul 5, AAA battery, STOCK_USAGE, DEP-2026-4M8Q2W6E, -5, 17.33, -86.67, 145.
- **Export:** CSV.

## 12. R11 - Low Stock

- **Purpose:** restocking trigger.
- **Data source:** InventoryItems (on-hand vs reorderLevel).
- **Filters:** none (always current).
- **Formula:** flag when onHand <= reorderLevel; suggested qty = reorderLevel x multiplier - onHand.
- **Included:** active items at or below reorder level.
- **Excluded:** inactive items.
- **Columns:** item, sku, on-hand, reorder level, suggested qty.
- **Example:** photobooth paper A4, PHP 0, 5, 10.
- **Export:** CSV.

## 13. R12 - Equipment Status

- **Purpose:** asset health.
- **Data source:** Equipment, EquipmentMovements.
- **Filters:** by status/category.
- **Formula:** none (status rollup + last maintenance date + depreciation to date).
- **Included:** all equipment.
- **Excluded:** none.
- **Columns:** equipmentId, name, category, status, condition, last maintenance, next maintenance (30-day flag), book value.
- **Example:** Sony A7III, CAMERA, IN_SERVICE, GOOD, 2026-06-20, due, PHP 78,000.
- **Export:** CSV.

## 14. R13 - Partner Commissions

- **Purpose:** commission liability and settlement.
- **Data source:** PartnerCommissions, Bookings.
- **Filters:** period, partner.
- **Formula:** commissionAmount = baseAmount x ratePct / 100.
- **Included:** commissions on confirmed bookings.
- **Excluded:** cancelled bookings.
- **Columns:** partner, type, booking, base, rate, commission, status.
- **Example:** Venue A, VENUE, BKG-2026-..., PHP 40,000, 10%, PHP 4,000, DUE.
- **Export:** CSV.

## 15. R14 - Crew Payments

- **Purpose:** crew cost and outstanding pay.
- **Data source:** CrewAssignments, CrewPayments.
- **Filters:** period, crew.
- **Formula:** total = sum(payAmount); paid = sum(CrewPayments.amount); balance = total - paid.
- **Included:** assignments on non-cancelled bookings.
- **Excluded:** cancelled bookings.
- **Columns:** crew, role, bookings, hours, rate, total, paid, balance.
- **Example:** Jay R., photoman, 3, 18h, PHP 200/h, PHP 3,600, PHP 2,400, PHP 1,200.
- **Export:** CSV.

## 16. R15 - Daily Cash Reconciliation

- **Purpose:** verify the ledger against reality per day.
- **Data source:** DailyCashReconciliations, CashTransactions.
- **Filters:** date, account.
- **Formula:** systemClosing = computed ledger balance at end of day; difference = actualClosing - systemClosing.
- **Included:** VERIFIED transactions up to end of day.
- **Excluded:** later-dated transactions.
- **Columns:** date, account, system closing, actual closing, difference, reconciled by, notes.
- **Example:** 2026-08-05, GCash, PHP 12,340.00, PHP 12,340.00, PHP 0.00, Owner, OK.
- **Export:** CSV.

## 17. R16 - Gross versus Net Income

- **Purpose:** distinguish cash-based and accrual-based results.
- **Data source:** CashTransactions + R3.
- **Formula:** cash net = sum(INCOME) - sum(EXPENSE) - sum(REFUND) (VERIFIED, period); accrual net = R3 net.
- **Included:** VERIFIED transactions in period.
- **Excluded:** transfers, owner funds (shown separately).
- **Columns:** period, cash in, cash out, cash net, accrual revenue, accrual direct, accrual operating, accrual net, difference, note.
- **Example:** Jul: cash net 61,500 vs accrual net 53,000; difference explained by deposit timing.
- **Export:** CSV, PDF.

## 18. Export Formats

- CSV for all tabular reports (UTF-8).
- PDF for R3 and R16 via print stylesheet (Sprint 8+).
- Exports archived under `Drive/.../Reports/<yyyy-mm>/` and indexed in Files (Sprint 8+).

## 19. Cross-References

- Money rules: `docs/FINANCIAL_RULES.md`
- Data sources: `docs/DATABASE_SCHEMA.md`
- Workflows that produce data: `docs/BUSINESS_WORKFLOWS.md`
- Dashboard UI: `docs/DESIGN_SYSTEM.md`
- Test fixtures: `docs/TESTING_CHECKLIST.md`