# PRODUCT_REQUIREMENTS.md

> Business requirements for Salikha Studio OS.

## Purpose

Define what the product is, the users it serves, every business module, its functional requirements, and the non-functional requirements that constrain the design and implementation. This document is the contract for **feature scope** and **behavior**.

## Scope

- In scope: the 16 v1.0 modules listed below, plus the dashboard and analytics.
- Out of scope in v1.0: public booking portal, online payment gateway, multi-tenancy, native mobile apps. These are captured under Future Expansion for each module.

Authority: This document ranks below `FINANCIAL_RULES.md`, `DATABASE_SCHEMA.md`, `SECURITY_MODEL.md`, and `BUSINESS_WORKFLOWS.md`.

## Overview

Salikha Studio OS turns a busy studio operation into one orderly system. Workflows — not screens — drive the design. The system begins at the moment a stranger asks for a price and ends at the report that closes the month's books. Every module is a spoke on a hub: **the booking**, and the hub's engine is **cash**.

---

## Table of Contents

1. [Definitions](#1-definitions)
2. [Personas](#2-personas)
3. [Module Map](#3-module-map)
4. [Module: Dashboard](#4-module-dashboard)
5. [Module: Leads](#5-module-leads)
6. [Module: Clients](#6-module-clients)
7. [Module: Bookings](#7-module-bookings)
8. [Module: Calendar](#8-module-calendar)
9. [Module: Event Production](#9-module-event-production)
10. [Module: Deployments](#10-module-deployments)
11. [Module: Inventory](#11-module-inventory)
12. [Module: Equipment](#12-module-equipment)
13. [Module: Cashflow](#13-module-cashflow)
14. [Module: Payments](#14-module-payments)
15. [Module: Expenses](#15-module-expenses)
16. [Module: Packages](#16-module-packages)
17. [Module: Purchasing](#17-module-purchasing)
18. [Module: Partners](#18-module-partners)
19. [Module: Crew](#19-module-crew)
20. [Module: Reports & Analytics](#20-module-reports--analytics)
21. [Module: Files](#21-module-files)
22. [Module: Settings](#22-module-settings)
23. [Non-Functional Requirements](#23-non-functional-requirements)
24. [Future Expansion](#24-future-expansion)
25. [Cross-References](#25-cross-references)

---

## 1. Definitions

| Term | Definition |
|---|---|
| Client | A customer (person or organization) with at least one accepted booking. |
| Lead | A prospective client who has not yet converted to a booking. |
| Booking | A confirmed contract for one or more services on a date/batteries. |
| Event | The real-world date(s) on which a booking is served. |
| Deployment | The operational plan and actual record for an event: what went out, what came back, crew sign-off, issues. |
| Package | A pre-priced bundle of services offered for sale. |
| Service | A single productized offering (e.g., Photography Full Day, Photobooth 4h, Photoman). |
| Cash transaction | One movement of money into or out of a cash account. The financial source of truth. |
| Direct cost | A cost that appears only because a specific booking happened. |
| Operating expense | A cost of running the business that is not tied to one booking. |
| Partner | A person or company that works with Salikha Studio (venue partners, suppliers, referrals, sub-contractors). |
| Crew | Hired personnel who staff events. |
| Purchase order | A record of a planned/approved purchase from a supplier. |
| Material | Consumable inventory item consumed by a booking. |

Full data definitions: `DATABASE_SCHEMA.md`. Financial definitions: `FINANCIAL_RULES.md`.

---

## 2. Personas

### 2.1 The Owner
The primary operator of the business. Needs to run the business from one place: see cash, approve expenses, review bookings and profitability, and manage partners.

### 2.2 The Finance Staff
Handles cash transactions, payments, expenses, and reconciliations. Must never need to understand the rest of the system deeper than the money rules.

### 2.3 The Operations Staff
Responsible for leads → bookings → production → deployment. Coordinates crew, equipment, materials.

### 2.4 The Crew (Event Lead & Members)
Runs the deployment form on the day of the event: checklists, incidents, crew sign-off, return reconciliation. Crew members see only their assigned events and own pay records.

### 2.5 The Administrator
Day-to-day management and approvals across operations and finance, excluding owner funds and user management.

### 2.6 The Viewer
Read-only access (e.g., accountant or an external advisor) who can look but never touch.

---

## 3. Module Map

| # | Module | Primary Users | Hub Type | Version 1 |
|---|---|---|---|---|
| 1 | Dashboard | Owner | Overview | Priority |
| 2 | Leads | Operations | Pipeline | Included |
| 3 | Clients | Owner, Operations | Master data | Priority |
| 4 | Bookings | Owner, Operations | Transaction hub | Priority |
| 5 | Calendar | All | Timeline | Priority |
| 6 | Event Production | Operations, Crew | Preparation | Included |
| 7 | Deployments | Crew, Operations | Event execution | Priority |
| 8 | Inventory | Operations | Stock | Priority |
| 9 | Equipment | Operations | Assets | Priority |
| 10 | Cashflow | Owner, Finance | Money | Priority |
| 11 | Payments | Finance | Money | Priority |
| 12 | Expenses | Finance | Money | Priority |
| 13 | Packages | Owner | Catalog | Priority |
| 14 | Purchasing | Operations, Finance | Procurement | Included |
| 15 | Partners | Finance, Operations | Master data | Included |
| 16 | Crew | Operations, Owner | People | Included |
| 17 | Reports & Analytics | Owner | Insight | Priority |
| 18 | Files | All | Documents | Included |
| 19 | Settings | Owner | Governance | Priority |

Version 1 priority modules (13): Dashboard, Clients, Bookings, Calendar, Cashflow, Payments, Expenses, Inventory, Equipment, Deployments, Packages, Reports, Settings. The remaining six modules (Leads, Event Production, Purchasing, Partners, Crew, Files) are also in Version 1 scope per `docs/IMPLEMENTATION_PLAN.md`. Advanced leads pipelines, full crew payroll, advanced partner workflows, Facebook integration, AI assistance, and SaaS capabilities are intentionally post-Version 1.

---

## 3. Common Patterns (Gives the "OS" feel)

Every module follows the same interaction pattern so the system feels *operational*, not screen-per-silo:

- **List view** → search and filter → **Detail view** → actions (state transitions, create sub-records, print/export).
- Actions are expressed as **business verbs** (e.g., "Win Lead", "Confirm Booking", "Verify Payment", "Reconcile Deployment").
- Every change leaves an **audit trace** (see `docs/SECURITY_MODEL.md`).
- Every screen shows its **own purpose**: a title, a summary strip, and the record's current status.

---

## 4. Module: Dashboard

### Purpose
Give the Owner an at-a-glance operational pulse without opening every module.

### Functional Requirements
- **Money pulse**: cash balance per account, today's cash in, today's cash out, net cash today.
- **Booking pulse**: today's events, this week's events, confirmation status.
- **Payments due**: unpaid balances, upcoming due dates.
- **Operational alerts**: low-stock inventory items, deployments not yet reconciled, equipment needing maintenance.
- **Charts**: 30-day cash balance trend; revenue vs. direct costs (last 3 months); top packages by revenue.
- **Deep links**: click through to the underlying record.

### Rules
- All figures are computed by the backend from the documented sources (see `docs/REPORT_DEFINITIONS.md`). The frontend only draws.
- Dashboard numbers may be cached for up to 1 minute (performance); the user can force a refresh. All cached values must display the timestamp they were computed at.

### Future
- Owner weekly digest email.

---

## 5. Module: Leads

### Purpose
Capture and manage prospects until they become clients (and later, bookings).

### Functional requirements
- Create a lead manually (Owner/Operations) with contact details, service interest, event interest (optional), source channel, priority, and follow-up date.
- **Pipeline stages**: NEW → CONTACTED → QUALIFIED → QUOTED → FOLLOW_UP → NEGOTIATING → WON | LOST | ARCHIVED.
- Actions: advance through valid transitions, mark lost (reason required), archive, reopen (reason required), log interactions (no external messaging).
- A lead that is **WON** through **conversion** creates or links to a **Client** in one atomic step (Sprint 2). Booking creation from a won lead arrives in Sprint 3.

### Rules
- `WON` is reachable only through the conversion workflow; a converted lead cannot be converted again.
- Logging a lead as lost requires a mandatory `lostReason`; reopening a lost/archived lead requires a recorded reason.
- Conversion preserves the lead record, sets `converted_client_id`/`converted_at`, and never creates a booking in Sprint 2.
- Event interest and budget are informational only - they create no bookings and no financial records.

### Example
```
Lead "Maria Santos" — Facebook — Premium Photobooth interest, budget 6,000, NEW → CONTACTED → QUALIFIED
→ Convert to client → new Client created from the lead → lead WON with converted_client_id. No booking is created.
```

### Cross-references
- Conversion flow: `docs/BUSINESS_WORKFLOWS.md §Leads→Booking`.
- Lead table: `docs/DATABASE_SCHEMA.md §Leads`.

---

## 6. Module: Clients

### Purpose
Master record of everyone who books services; the source of the client list for reports and CRM.

### Functional requirements
- Profile: name, company, contact (phone, email), address (optional), tags (optional), notes.
- Lifetime view: total paid, total outstanding, total bookings, booking count, last event date.
- Merge duplicate clients (soft-merge with audit trail).
- Actions: `deactivate` (soft) and `reactivate`.

### Rules
- Clients are never physically deleted. Deletion = soft `deactivate`.
- Client balance shown on profile **comes only from bookings' `balanceRemaining`**, which itself comes only from recorded payments (see `docs/FINANCIAL_RULES.md`).

---

## 7. Module: Bookings

### Purpose
The transaction hub. Records what was sold, for whom, for which date, at which price, and which costs apply. Provides every booking's profitability.

### Functional requirements
#### Booking record
- Client (from Client list), event date, event venue, services (line items with quantity and price).
- Status: `DRAFT → CONFIRMED → PRE_PRODUCTION → PRODUCTION → COMPLETED | CANCELLED` (full enum below).
- Payment plan: due dates, amounts, deposit %, remainder due date.
- A booking can be created directly (from a Client) or via a **WON lead**.

#### Booking profitability (computed by backend only)
For each booking the system computes:
- `revenueSubtotal` (services total)
- `discounts`, `taxes` (optional)
- `revenueTotal`
- **Direct costs**: material costs actually used (from Deployment material usage), transportation, meals, crew payroll, commissions
- `grossProfit` = `revenueTotal − Σ directCost`
- `operatingCostAllocation` (business overhead allocated to the booking per policy: e.g., proportion of period expenses based on revenue share)
- `netProfit` = `grossProfit − operatingCostAllocation`
- `profitMargin` = `netProfit / revenueTotal`

No frontend or report reimplements these; all read the booking's computed `BookingCosts` record (see `docs/DATABASE_SCHEMA.md §5.3`).

#### Booking actions
- `Create Booking`, `Send Confirmation`, `Print Contract`, `Confirm`, `Advance to Production`, `Mark Completed`, `Cancel` (cancel reason mandatory), `Reopen`.

### Business rules
- Booking price **can be changed** only for `DRAFT`; after `CONFIRMED` changes go through a `void + new booking` process or an `amendment` record that preserves history (see `docs/BUSINESS_WORKFLOWS.md Amendment`).
- Booking only becomes `CANCELLED` together with any refund/reversal logic per `docs/FINANCIAL_RULES.md Refunds`.
- A booking with unfilled `balanceRemaining` shows a **due-badly** highlight (design token `status-warning`).

### Example
```
Services: Photobooth 4h PHP 20,000; Photoman Full Day PHP 10,000; Discount 10%. total = 27,000. Material used 2,400; crew 1 x 3,000; transport 1,500; commission 1,200 → direct = 8,100; gross = 18,900; allocation = 2,700; net = 16,200; margin = 60%.
```

---

## 8. Module: Calendar

### Purpose
The event timeline for all confirmed bookings.

### Functional requirements
- Month view with event cards (title, venue, crew count).
- Day click → event detail, deployment link, production checklist link.
- Filters: status (confirmed/production only), venue city.
- Calendar data source: bookings' `eventDate`. Google Calendar events are **best-effort mirrors**, never the source of truth.

---

## 9. Module: Event Production

### Purpose
Ongoing pre-event preparation.

### Functional requirements
- Per booking: a production checklist with required items (photobooth kit, props backdrop, printed materials...) derived from services.
- Prepare list of deployment items, crew assignments, transport plan.
- Flags: `READY_TO_DEPLOY` can only be set when every required item marked done and crew schedule confirmed.
- "Deployment fired" – when production readiness is set, the system creates the **Deployment record** (auto).

### Rules
- Production may 'unmark' readiness at any time before event; changing it is a minor version of the event.

---

## 10. Module: Deployments

### Purpose
Operational record of getting to the event, running the event, and returning. **Every booking automatically gets a Deployment.**

### Responsibilities
- **Deployment form** with sections:
  1. Consumables list (projected vs. loaded)
  2. Equipment list (per unit assigned to booking)
  3. Deployment checklist (per `DeploymentChecklistTemplate`)
  4. Crew list with **sign-off** per member, time in/out
  5. Issues / incident log (severity, description, action taken)
  6. Return reconciliation (item vs. returned count, damages)
  7. Material usage (which items were consumed, quantities)
- Status flow: `PLANNED` → `IN_PROGRESS` → `RETURNED` → `RECONCILED` → `CLOSED` (with abort via `CLOSED-ABORT`).
- On **RECONCILED**, the system:
  - Writes inventory adjustments (consumed items; see `docs/FINANCIAL_RULES.md Inventory`).
  - Updates `Actual Material Cost` on the deployment.
  - Re-runs booking profitability (material cost real).

### Business rules
- You cannot post `RECONCILED` while checklist incomplete or crew sign-off missing.
- Once RECONCILED the material consumption **cannot** be edited; corrections create a reversal/adjustment.

---

### Deployment creation
When production readiness is set (`READY_TO_DEPLOY`), the system auto-creates a Deployment in `PLANNED` with the material and equipment list pulled from the booking's Production plan.

---

## 11. Module: Inventory

### Purpose
Track consumable stock: quantity on hand, batches, valuation, and consumption per event.

### Responsibilities
- Items: SKU, name, category, unit, reorder level, on-hand (computed), cost method (weighted average or FIFO per item policy), storage location.
- Movements: `STOCK_IN` (purchase/receipt), `STOCK_USAGE` (from deployment), `ADJUSTMENT` (stock take, damage), `RETURN` (unused item returned from event), `WRITE_OFF`.
- Batches: items supplied per purchase order; on-hand = Σ units in unexpired batches.
- Valuation: batch weighted average (default policy) — see formula in `docs/DATABASE_SCHEMA.md` and steps in `docs/FINANCIAL_RULES.md`.

### Business rules
- On-hand may **not** go negative; a deployment material usage that would create negative stock is blocked (requires adjustment first).
- Inventory valuations NEVER change a booking's already-allocated cost once `RECONCILED.

### Example
- Item "Battery AA 20-pack" cost at purchase $6.80 → batch at $6.80× unit. Used 2 packs at deployment → material cost $13.60, stock −2.

---

## 12. Module: Equipment

### Purpose
Asset registry for non-consumable equipment (cameras, photo printers, light stands, photobooth rigs).

### Responsibilities
- Equipment record: name, category (camera, audio, print, booth, lighting, other), serial, condition, purchase date, purchase price (capital), depreciation policy (straight-line below), status.
- Assignment to a booking/deployment check.
- Maintenance log: type, date, cost, vendor).

### Business rules
- An equipment purchase is a **capital expense**: it does NOT hit the income statement at purchase (see `docs/FINANCIAL_RULES.md`).
- Deprecation is computed monthly per policy (straight-line over `usefulLifeMonths`, residual $0 default) for report use; it does not require a monthly cash movement.

---

## 13. Module: Cashflow

### Purpose
The financial source of truth. Purely transaction-driven.

### Responsibilities
- Cash accounts: name, type (CHECKING, SAVINGS, CASH_IN_HAND, E_WALLET, OTHER), opening balance, current balance (computed `Σ transactions`).
- Cash transactions: date, account, type, category, counterparty (Booking/Payment/Supplier/Partner/General), amount, memo, refs, status `PENDING|VERIFIED|REVERSED`, tax as needed.

Transaction types:
| Type | Effect | Income? |
|---|---|---|
| `INCOME` | account ↑ | Yes (business). From payments, other income |
| `EXPENSE` | account ↓ | No (business) |
| `TRANSFER_IN` / `TRANSFER_OUT` | account ↑ / account ↓ | No |
| `CAPITAL_IN` | account ↑ | No (owner) |
| `WITHDRAWAL` | account ↓ | No (owner vs profit) |
| `ADJUSTMENT` | ± | Neutral (corrections/rounding) |
| `REFUND` | account ↓ | No (returns) |

### Business rules
- Sum of `balance = openingBalance + Σ(VERIFIED transactions)` per account.
- No balance math with booking totals, expense totals only, invoice totals only, receivable totals only.
- No cash transaction may be modified/deleted after `VERIFIED` — only `VOID` the transaction (record a void reason) — see `docs/FINANCIAL_RULES.md`.
- `PENDING` transactions do not affect balance.

---

## 14. Module: Payments

### Purpose
Records money owed and received per booking.

### Responsibilities
- Payment record: booking, amount, method, date, reference, status `PENDING|RECORDED|VERIFIED|FAILED|REFUNDED`.
- Payment history by booking (net of receipts) → booking `balance`.
- Auto-generation of deposit/installment records from Booking payment plan (editable at `DRAFT`).
- Apply a receipt → create `RECORDED`, owner/accountant verifies → `VERIFIED` → automatically mints a matching **Income** cash transaction unless `pends payment`.

### Business rules
- Payment `RECORDED` does not change cash; **verification** does.
- `PaymentVerified` always links for the audit trail to its cash transaction id.
- Refund of a payment → creates a refund `transaction` (out) and marks previous payment `REFUNDED`.

---

## 15. Module: Expenses

### Purpose
Capture and control outgoing costs.

### Responsibilities
- Expense: date, category, amount (net of VAT flag), description, paid-from (account, when), paid date, method, receipt file, supplier, booking link (if an event direct cost), approval.
- Approval flow `DRAFT → SUBMITTED → APPROVED | REJECTED → PAID`.
- Expense to booking: `COST_TYPE` `DIRECT` shares why: material, transport, meals, crew, commission, other.

### Business rules
- Only `PAID` + `APPROVED` expenses generate a cash `EXPENSE` transaction and appear on reports.
- Crew costs and partner commissions get dedicated record types (see Crew & Partners) — but they always land as `EXPENSE` cash transactions when paid.

---

## 16. Module: Packages

### Purpose
Productized bundles with fixed profit profile.

### Responsibilities
- Package: code, name, category, description, services (1+ service lines each with price or flag included), base price, recommended price.
- A booking references a package; Booking possible base price + optional extras.
- price lookups display current; snapshoot the config into booking at cost as booked.

### Rules
- Revenue = actual booking (what client agreed), never "package price" if negotiated.
- Packages changes require notifying existing bookings; bookings keep their original terms.

---

## 17. Module: Purchasing

### Purpose
Manage orders to suppliers for stock and equipment.

### Responsibilities
- Vendors = partners with role `SUPPLIER`.
- Purchase order: PO#, date, vendor, expected date, lines (item/Qty/unit), status `DRAFT → ORDERED → PARTIAL_RECEIVED → RECEIVED → CANCELLED`.
- Receipt of stock → inventory `STOCK_IN` (batch with weight).
- Receipt of equipment → equipment registry record.
- PO such that booking reference for direct imm.

### Rules
- A PO cost = Σ lines. Landing/other fees (shipping, customs) may be recorded against the PO and allocated to lines/batches.
- `RECEIVED` and `PAID` link to a payables position.

---

## 18. Module: Partners

### Responsibilities
- Partner registry: type `REFERRAL | SUPPLIER | SUB_CONTRACTOR | VENUE | OTHER`, contact, commission/referral rate, status.
- Partner commission: booking → commission `PENDING | DUE | PAID`, based on the booking commission basis (a % of package revenue of services) per partner contract.

### Rules
- Paid commission creates an `EXPENSE` (commission) cash transaction and booking direct cost.

---

## 19. Module: Crew

### Responsibilities
- Crew member: name, contact, role tags (photographer, photobooth operator, photoman, driver), pay rate (hourly/day), tax/bank convenience to favorite.
- Crew assignment to a booking/deployment: role, dates, hours, rate, pay amount.
- Crew payment record: amount, when, from account; creates EXPENSE (crew) cash transaction.

### Rules
- Crew payments are only accurate to the crew record, not ad-hoc "misc".
- Every paid crew has a row in the crew payment reporting line.

---

## 20. Module: Reports & Analytics

See the full catalog (each with stated assumptions): `docs/REPORT_DEFINITIONS.md`. The dashboard consumes the report service; all report logic is backend only.

Reports required v1.0: Cashflow Report, Income Statement, Inventory Reports (valuation, low-stock), Booking Profitability, Outstanding Balances, Revenue by Package, by Service, Crew Payments, Partner Commissions, Business Dashboard.

---

## 21. Module: Files

### Responsibilities
- Link business documents: contracts, receipts of supplier, forms, images, galleries to the right entity (booking, client, expense, PO, etc.).
- Store file references (Drive file/folder ID) in `Files`; never store content in Sheets.
- Folder per top-level subject: `Clients/<clientId>`, `Bookings/<bookingId>`, `Purchases/<poId>`, etc. `docs/DEPLOYMENT_GUIDE.md`.
- Permissions: folder access follows user role; the file owner (the Web App service account) and owner-driver may both access.

---

## 22. Module: Settings

### Responsibilities
- Business profile (name, address, tax ID, timezone, currency).
- Open defaults: booking confirm, big receivables over threshold, low stock.
- ID sequences management (view-only).
- Users & roles (see `docs/ROLE_PERMISSIONS.md`).
- Auto reports (email weekly Monday).
- Backup settings & link to runbook.

---

## 23. Non-Functional Requirements (NFRs)

| NFR | Requirement |
|---|---|
| Performance | Typical list load <1.5s; detail load <2s; dashboard <2s (after 1 min cache). |
| Availability | No SLT; web-app must behave within Google Sheets/Oauth rate limits; schedules a cap of 20,000 cell reads per minute per executor. |
| Capacity | Designed for ≤ 5,000 bookings, ≤ 30k transactions, ≤ 5k inventory items, ≤ 20 users. |
| Mobile | Fully usable on a mobile browser; primary workflow (deployment sign-off, payment entry) must be usable on phone (see `docs/DESIGN_SYSTEM.md`). |
| Offline | No offline mode in v1.0. All actions require network to backend. |
| Security | All requests authorize per role; secrets in Script Properties; 100% audit (see `docs/SECURITY_MODEL.md`). |
| Backup | Daily backups, RPO ≤24h, RTO ≤ (see `docs/BACKUP_RECOVERY.md`). |
| Maintainability | Modular Apps Script project structure per `AGENTS.md`; no monoliths. |
| Logging | Structured platform log + audit per mutation. |
| Reporting accuracy | Every documented report defines its transaction scope (see `docs/REPORT_DEFINITIONS.md`). |

---

## 24. Future Expansion

- Client-facing self-service portal (leads + reschedule + quote).
- Payment gateway integration (PayMongo/GCash) wired to the cash transaction layer.
- Multi-tenant SaaS multi-company (the schema is already tenant-ready: every ID-scoped per business; timezone/currency in Settings).
- Native mobile app; the SPA API contract (Google.script.run wrapper) already supports protocol transport move.
- In-app photos delivery portal / client galleries.
- Deep analytics (product-level margin by package, cohort).

---

## 25. Cross-References

- Data — `DATABASE_SCHEMA.md`
- Money — `FINANCIAL_RULES.md`
- Process — `BUSINESS_WORKFLOWS.md`
- UI — `DESIGN_SYSTEM.md`
- Roles — `ROLE_PERMISSIONS.md`
- Reports — `REPORT_DEFINITIONS.md`
- Security — `SECURITY_MODEL.md`
- Delivery — `IMPLEMENTATION_PLAN.md`, `TESTING_CHECKLIST.md`, `DEPLOYMENT_GUIDE.md`