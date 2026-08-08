# ROLE_PERMISSIONS.md

## Purpose

Define the roles of Salikha Studio OS and the exact permission matrix every backend action must enforce. UI hiding is cosmetic; server-side authorization is the law.

## Scope

- Roles and assignment rules.
- Permission matrix by module and action.
- Enforcement rules and error codes.
- Owner-only functions.

## Overview

Six roles. The auth gate builds a request context `{ user, role, ip, timestamp, requestId }` for every call; services call `requireRole(...)` from core. Denied actions return the structured error `{ success:false, error:{ code:"PERMISSION_DENIED" } }`.

---

## Table of Contents

1. [Roles](#1-roles)
2. [Permissions by Module](#2-permissions-by-module)
3. [Permissions by Action](#3-permissions-by-action)
4. [Enforcement Rules](#4-enforcement-rules)
5. [Owner-Only Functions](#5-owner-only-functions)
6. [Role Assignment and Management](#6-role-assignment-and-management)
7. [Future Expansion](#7-future-expansion)
8. [Cross-References](#8-cross-references)

---

## 1. Roles

| Role | Code | Description |
|---|---|---|
| Owner | `OWNER` | Full access. Only role that manages owner funds, users, and settings. |
| Administrator | `ADMIN` | Full operational access except owner-fund movements and user management. |
| Finance Staff | `FINANCE` | Money operations: payments, cashflow, expenses, reconciliations, reports. |
| Operations Staff | `OPERATIONS` | Leads, clients, bookings, production, deployments, inventory, equipment, purchasing, crew, partners. |
| Crew | `CREW` | Assigned events and deployments, own sign-off and pay records. |
| Viewer | `VIEWER` | Read-only access across modules (future external advisors). |

## 2. Permissions by Module

Legend: R read - W create/edit - A approve/verify/finalize - V void/reverse - - none

| Module | OWNER | ADMIN | FINANCE | OPERATIONS | CREW | VIEWER |
|---|---|---|---|---|---|---|
| Dashboard | R | R | R | R | R (own) | R |
| Calendar | R | R | R | R | R | R |
| Leads | RWA | RWA | R | RWA | - | R |
| Clients | RWA | RWA | R | RWA | - | R |
| Bookings | RWA | RWA | R | RWA | R (assigned) | R |
| Production (Tasks) | RWA | RWA | R | RWA | R (assigned) | R |
| Deployments | RWA | RWA | R | RWA | RWA (own event) | R |
| Inventory | RWA | RWA | R | RWA | R | R |
| Equipment | RWA | RWA | R | RWA | R | R |
| Cashflow | RWA | R | RWA | R | R | R |
| Payments | RWA | R | RWA (verify) | R | R | R |
| Expenses | RWA | RWA (approve) | RWA (pay) | R | R | R |
| Packages | RWA | RWA | R | RWA | - | R |
| Purchasing | RWA | RWA | RWA (pay) | RWA (order/receive) | R | R |
| Partners | RWA | RWA | R | RWA | - | R |
| Crew | RWA | RWA | R | RWA | R (self) | R |
| Reports | R (all) | R (all) | R (financial) | R (operational) | R (own) | R |
| Files | RWA | RWA | RWA | RWA | RWA (own deployment) | R |
| Settings | RWA | R | R | R | - | R |
| AuditLogs | R | R | - | - | - | R |

## 3. Permissions by Action

| Action | OWNER | ADMIN | FINANCE | OPERATIONS | CREW |
|---|---|---|---|---|---|
| View | yes | yes | yes | yes | scoped |
| Create | yes | yes | per module | per module | no |
| Edit | yes | yes | per module | per module | no |
| Approve | yes | yes | per module | per module | no |
| Void / reverse | yes | no | own records with reason | no | no |
| Export | yes | yes | financial scope | operational scope | own scope |
| Delete (soft) | yes | yes | no | no | no |
| Reconcile (daily cash) | yes | no | yes | no | no |
| Reconcile (deployment) | yes | yes | no | yes | own event |
| Close (period) | yes | no | yes | no | no |
| Manage settings | yes | no | no | no | no |
| Manage users | yes | no | no | no | no |

## 4. Enforcement Rules

1. Every backend entry point calls `requireRole` or `requireAction` before touching data.
2. The router is the only place that reads `Session.getActiveUser()`; services receive the context.
3. Role resolution from `Users` sheet, cached per request (60s).
4. Row-level scoping: Crew sees only deployments, checklists, and assignments where they are the assigned member. Enforced in service queries.
5. Approval vs. payment separation: ADMIN approves expenses; FINANCE pays them. ADMIN cannot verify payments; FINANCE can.
6. Voiding always requires a reason and writes an audit entry with the actor role.
7. UI hiding is never treated as authorization.

## 5. Owner-Only Functions

- User creation, deactivation, role assignment.
- `CAPITAL_IN` / `WITHDRAWAL` cash transactions.
- Opening balance changes on cash accounts.
- Settings: tax rate, currency, timezone, backup configuration.
- Period hard-close.

## 6. Role Assignment and Management

- Owner assigns roles in Settings > Users (Sprint 2+; Users sheet exists from Sprint 1).
- Changes take effect within 60s (per-request revalidation).
- Deactivation is soft (`active = FALSE`).
- First registered user is auto-assigned `OWNER` (bootstrap rule, `docs/SECURITY_MODEL.md`).

## 7. Future Expansion

- Custom roles with fine-grained capability sets.
- Multi-tenant tenant-admin role.
- Two-factor enforcement for financial roles.
- Multi-level approval chains.

## 8. Cross-References

- Authentication and sessions: `docs/SECURITY_MODEL.md`
- Workflow actors: `docs/BUSINESS_WORKFLOWS.md`
- Users sheet: `docs/DATABASE_SCHEMA.md` (2.3)
- Audit of role actions: `docs/SECURITY_MODEL.md`