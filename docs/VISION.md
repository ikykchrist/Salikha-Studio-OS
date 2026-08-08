# VISION.md

> The strategic north star for Salikha Studio OS.

## Purpose

Explain why Salikha Studio OS exists, what problems it solves, what it will become, and the principles that govern every design and implementation decision. This document is read before any feature work begins.

## Scope

- Business problems and context
- Product principles
- Target users
- Version 1 definition (and what is excluded)
- Long-term direction
- Decision-making principles
- Definition of success

## Overview

Salikha Studio runs photography, photobooth, and photoman services. The business has outgrown scattered spreadsheets, chat threads, and memory. Salikha Studio OS is the single system that runs the business: leads become clients, clients become bookings, bookings become events, events consume inventory and crew, and money flows through a verifiable cash ledger.

---

## Table of Contents

1. [Why Salikha Studio OS Exists](#1-why-salikha-studio-os-exists)
2. [Business Problems It Solves](#2-business-problems-it-solves)
3. [Product Principles](#3-product-principles)
4. [Target Users](#4-target-users)
5. [Version 1 Definition](#5-version-1-definition)
6. [Long-Term Direction](#6-long-term-direction)
7. [Intentionally Excluded from Version 1](#7-intentionally-excluded-from-version-1)
8. [Decision-Making Principles](#8-decision-making-principles)
9. [Definition of Success](#9-definition-of-success)
10. [Cross-References](#10-cross-references)

---

## 1. Why Salikha Studio OS Exists

A studio business makes money only when three things line up: the right booking, the right crew and equipment, and the right cash position. Without a system, these live in separate places:

- Bookings live in messages and memory.
- Inventory lives on shelves and in receipts.
- Cash lives in bank apps, wallets, and pockets.
- Profit is a feeling, not a number.

Salikha Studio OS exists so the owner can answer three questions at any moment:

1. **What is happening?** Which events are booked, prepared, deployed, and reconciled.
2. **What do we have?** Which clients owe money, which stock is low, which equipment is in service.
3. **How are we doing?** What is the real cash position and the real profit per booking.

## 2. Business Problems It Solves

| Problem | How the OS solves it |
|---|---|
| Bookings scattered across chats and memory | One booking record with services, payment plan, and profitability |
| Cash position is guesswork | A verified cash transaction ledger; balances come from the ledger only |
| Clients are forgotten after events | Client master with full booking and payment history |
| Event day chaos | Deployment forms with checklists, crew sign-off, and return reconciliation |
| Inventory disappears silently | Batch tracking, movement ledger, low-stock alerts, valuation |
| Profit per booking unknown | Material, transport, meals, crew, and commission costs allocated per booking |
| No audit trail | Every mutation is logged; financial records are never hard-deleted |

## 3. Product Principles

1. **Cash is the source of truth.** Booking totals are commitments, not cash. Balances are computed from verified cash transactions only.
2. **Workflows over screens.** The system is designed around business processes (lead to booking, event to reconciliation, month to close), not around interface aesthetics.
3. **One logic copy.** Business rules live in the backend. The frontend renders and calls; it never recomputes money or inventory.
4. **Never destroy history.** Financial and operational records are soft-deleted or voided, never purged.
5. **Integrity before convenience.** Validations, immutable verified transactions, and audit logs may add friction; that friction is the product working.
6. **Built to last.** The system is designed as a future SaaS product. No shortcuts "because it is a spreadsheet app."
7. **Quiet interface.** Clean, minimal, professional. Eye candy only where the data matters.

## 4. Target Users

| User | Relationship to the system |
|---|---|
| Owner | Runs the business from one place: cash, approvals, profitability, partners |
| Administrator | Day-to-day management, approvals, and configuration |
| Finance Staff | Payments, cashflow, expenses, reconciliations |
| Operations Staff | Leads, bookings, production, deployment coordination |
| Crew | Assigned events, checklists, sign-off, own pay records |
| Viewer | Read-only access for future external advisors |

Role details: `docs/ROLE_PERMISSIONS.md`.

## 5. Version 1 Definition

Version 1 is the complete operational loop for the studio:

- **Sell it:** Dashboard, Calendar, Leads, Clients, Bookings, Packages.
- **Do it:** Event Production preparation, Deployments with checklists and crew sign-off, Inventory, Equipment.
- **Count it:** Cashflow, Payments, Expenses, Receivables.
- **Understand it:** Reports and the dashboard KPIs.
- **Govern it:** Settings, users, files.

Version 1 covers the modules listed in `docs/PRODUCT_REQUIREMENTS.md` as Version 1 priority: Dashboard, Clients, Bookings, Calendar, Cashflow, Payments, Expenses, Inventory, Equipment, Deployments, Packages, Reports, Settings — plus Leads, Event Production, Purchasing, Partners, Crew, and Files as scheduled in `docs/IMPLEMENTATION_PLAN.md`.

## 6. Long-Term Direction

- **SaaS productization:** multi-tenant hosting, subscription billing, client self-service portal.
- **Payment integration:** PayMongo / GCash wired into the cash transaction layer.
- **Deeper analytics:** product-level margins, cohort and seasonality analysis.
- **Client gallery delivery:** direct photo delivery portals.
- **Harder infrastructure:** a real database backend while keeping the same logical model.

The architecture (modular services, response envelopes, ID discipline, audit-first design) is chosen so this evolution does not require a rewrite.

## 7. Intentionally Excluded from Version 1

- Public client-facing booking portal
- Online payment gateways (designed for, not built)
- Multi-tenant / SaaS hosting
- Native mobile apps (the SPA is mobile-responsive)
- Offline mode
- External UI frameworks, chart libraries, or build tooling

## 8. Decision-Making Principles

When requirements are ambiguous, decisions are made in this order:

1. Follow `docs/FINANCIAL_RULES.md` — money rules outrank everything.
2. Follow `docs/DATABASE_SCHEMA.md` — the data contract.
3. Follow `docs/BUSINESS_WORKFLOWS.md` — process sequencing.
4. Follow `docs/SECURITY_MODEL.md` — security and audit.
5. Ask the owner with concrete options when the docs are silent.

Never trade auditability, immutability, or cash correctness for implementation speed.

## 9. Definition of Success

Version 1 is successful when:

- The owner runs the business from the system alone for a full month.
- Cash balances in the system match the bank and wallet statements without guesswork.
- Every booking shows a defensible profit or loss figure.
- Every event day is run from the deployment form.
- Month-end close takes an afternoon, not a week.
- Nothing is permanently lost: every financial record ever created can be traced.

## 10. Cross-References

- Product scope: `docs/PRODUCT_REQUIREMENTS.md`
- Build order: `docs/IMPLEMENTATION_PLAN.md`
- Money rules: `docs/FINANCIAL_RULES.md`
- Data contract: `docs/DATABASE_SCHEMA.md`
- Process design: `docs/BUSINESS_WORKFLOWS.md`
- How to work here: `AGENTS.md`