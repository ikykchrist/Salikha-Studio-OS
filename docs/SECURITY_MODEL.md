# SECURITY_MODEL.md

## Purpose

Define how Salikha Studio OS authenticates users, authorizes actions, audits changes, protects secrets, and scopes Google Drive access. Security is a design constraint from Sprint 0 — never an afterthought.

## Scope

- Authentication flow (GAS web app).
- Authorization model (roles, gates, request context).
- Audit logging contract.
- Secrets management.
- Drive scoping and file permissions.
- Data protection: immutability, soft-delete, correction policy.
- Incident handling and security testing.

Out of scope: role matrix content (see `ROLE_PERMISSIONS.md`), backup (see `BACKUP_RECOVERY.md`), environment setup (see `DEPLOYMENT_GUIDE.md`).

## Overview

The Web App runs **as the user accessing it** (`Execute as: User accessing the web app`), so Google identity is trusted for *who you are*; the app itself decides *what you may do* via the role system. Every request passes through the auth gate → role resolution → service-level `requireRole`. Every mutation is audited. Secrets never appear in code or sheets.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Authentication](#2-authentication)
3. [Authorization](#3-authorization)
4. [Request Context & Router Gate](#4-request-context--router-gate)
5. [Audit Logging](#5-audit-logging)
6. [Secrets Management](#6-secrets-management)
7. [Google Drive Scoping](#7-google-drive-scoping)
8. [Data Integrity Protections](#8-data-integrity-protections)
9. [Session & Token Handling](#9-session--token-handling)
10. [Security Testing & Incident Handling](#10-security-testing--incident-handling)
11. [Future Expansion](#11-future-expansion)
12. [Cross-References](#12-cross-references)

---

## 1. Threat Model

| Threat | Mitigation |
|---|---|
| Unauthorized user reaches the app | Google account auth; `Users` role required for every action |
| User with a role exceeds it | Backend `requireRole` on every entry point; frontend hiding is cosmetic only |
| Script/Data exfiltration | Read access follows role; Drive folders scoped; audit on export actions |
| Tampering with financial records | Immutability after VERIFIED; void-only correction; audit trail |
| Secret leakage | Script Properties only; never in code, sheets, logs, or repo |
| Mass-delete/abuse of shared sheet | Edit access limited to needed users; all writes via app services; version history as backstop |
| Malicious Drive file (phishing) | Only owner-managed folders shared; links use drive IDs from DB, never user-supplied URLs blindly |
| Replay of client-side calls | Server enforces state transitions; idempotency keys on money ops |

## 2. Authentication

- The GAS Web App is deployed **Execute as: User accessing the web app** — Google OAuth establishes identity.
- `doGet`/`doPost` never trusts the *session* alone: identity email + role resolution per request.
- **Bootstrap rule:** the first registered user in `Users` becomes `OWNER` (created at setup runbook step; see `DEPLOYMENT_GUIDE.md §3`).
- No password management in-app; Google handles credentials. Future: 2FA requirement for finance roles (settings flag).

### 2.1 Temporary actor (Sprint 1 limitation)

Full role-based authorization is not implemented yet (Sprint 1). Finance audit entries record a **temporary actor** resolved from `Session.getActiveUser().getEmail()` when available, otherwise the documented fallback `unknown-user`. This is not a security boundary: it identifies *who did what* in the audit log only. Do not claim the system enforces `ROLE_PERMISSIONS.md` until the auth gate lands (planned with the Users sheet).

## 3. Authorization

- Single source of truth for roles: `Users` sheet (`userId`, `role`, `active`).
- Role→capability matrix: `ROLE_PERMISSIONS.md` — the only authority. Code implements it in `core/roles.js` (a table, not scattered if-chains).
- Row-level scoping (Crew sees only own deployments; production rows per booking) enforced in service queries — never merely in the UI.

## 4. Request Context & Router Gate

Every request flows:

```
doPost/doGet
  → auth gate: resolve user email (Session.getActiveUser() ONLY here)
  → load role (cache 60s, validated against active flag)
  → build context { user, role, ip, timestamp, requestId }
  → route to service (module.action)
  → service calls requireRole(action) → proceed or { ok:false, code:"FORBIDDEN" }
  → audit write (if mutation)
  → structured response { ok:true, data } | { ok:false, code, message, details }
```

- Only the **router** may touch `Session`. Services receive context — testability (see `AGENTS.md`).
- Denied requests log a security event to `AuditLogs` (`action="auth.denied"`).

## 5. Audit Logging

Contract (see `AuditLogs` schema in `DATABASE_SCHEMA.md §2.7`):

| Field | Rule |
|---|---|
| `auditId` | sequence id |
| `ts` | DateTime (business tz) |
| `actorUserId` / `actorRole` | who did it |
| `action` | dotted `module.action` |
| `entityType` / `entityId` | what changed |
| `before` / `after` | JSON of the record's mutated fields |
| `ip` / `requestId` | traceability |

Rules:
1. Every mutation across all services writes exactly one audit row **in the same request** as the mutation (same flush).
2. Audit rows are **append-only**; no edit/delete of audit rows (owner-included).
3. Read-only views are not audited; exports of financial reports are audited.
4. Audit viewer: OWNER/ADMIN only (`ROLE_PERMISSIONS.md`).
5. Retention: 24 months online; older rows move to an `AuditArchive` sheet during month-end close (see `BUSINESS_WORKFLOWS.md WF-14`).

## 6. Secrets Management

- Secrets live in **Script Properties** (project-level), e.g. `SPREADSHEET_ID`, `FOLDER_ROOT_ID`, `CALENDAR_ID`, `ENV`, `BACKUP_FOLDER_ID` (see `DEPLOYMENT_GUIDE.md §8`).
- Forbidden: secrets in code, sheets, HTML, README, commits, logs.
- Only the owner keeps a password-managed inventory of Script Property values (for restoration per `BACKUP_RECOVERY.md Scenario D`).
- Rotation: annually; immediately on suspected exposure.
- Script service accounts: none beyond the owner's GAS project (future SaaS: dedicated service account with scoped Drive access).

## 7. Google Drive Scoping

- App manages a folder tree under `FOLDER_ROOT_ID` (see `DEPLOYMENT_GUIDE.md §6`).
- File writes always go through `FileService` which:
  1. Resolves target folder from entity id (client/booking/po/…);
  2. Validates the requester's role against the entity's scope;
  3. Writes via Drive API and records in `Files` sheet.
- Folder sharing: root shared only with users who need files; Crew gets their deployment folder only (role-scoped).
- Downloads/exports of sensitive folders are role-gated and audited.
- Never trust `fileName` from user input for path building — sanitize; never build paths from arbitrary strings.

## 8. Data Integrity Protections

1. **Immutability:** VERIFIED cash transactions are never edited/deleted — void + recreate (see `FINANCIAL_RULES.md §15`).
2. **Soft-delete everywhere:** financial and operational rows use status flags (`voided`, `active`, `status`); physical deletion forbidden on data sheets.
3. **Corrections leave traces:** every correction = new rows + audit; never in-place mutation of history.
4. **Idempotency:** money-minting actions (payment verify, expense pay) accept a client-provided idempotency key; duplicate submissions are ignored — no double cash.
5. **Sequence integrity:** IDs from `SequenceService` (atomic increment); no re-use.

## 9. Session & Token Handling

- Web App uses Google session cookies; no custom tokens in v1.0.
- Role revalidation: per-request (role change takes effect within 60s cache).
- Sensitive actions (verify payment, transfer, owner funds, close period) additionally require an **on-screen re-confirm** (blocking modal) — this is UX ceremony, security remains server-side.
- No localStorage of business data; only UI preferences may be stored locally.

## 9.1 Integration Resource IDs (Pre-Sprint 2)

- Resource IDs (`SPREADSHEET_ID`, `ROOT_DRIVE_FOLDER_ID`, `CALENDAR_ID`) live only in Apps Script Script Properties.
- Rules: never hardcoded in source; never returned to the frontend (statuses and names only); never logged (accessors throw before any logging); never committed to Git; never placed in `.clasp.json.example`.
- Accessors (`Config.getSpreadsheetId_()` etc.) trim values, reject placeholders and empty strings, and throw a user-friendly `CONFIGURATION_ERROR`. A malformed ID must never crash the application shell — verification functions map failures to safe statuses.
- Verification (`IntegrationService`) is read-only: it opens/names resources and checks schema; it never creates, moves, deletes, or shares anything.
- Scopes: inferred by Apps Script from used services (spreadsheets, drive for DriveApp, calendar for CalendarApp). No Gmail or unrelated scopes. The owner must re-authorize after deployment; connectivity is only confirmed at runtime via `getIntegrationStatus()`.

## 10. Security Testing & Incident Handling

**Testing (each release, per `TESTING_CHECKLIST.md`):**
- Role matrix tests: each role × each action; expect `FORBIDDEN` where disallowed.
- Audit completeness: every mutation → audit row count matches.
- Idempotency: double-submit money ops → single effect.
- Injection: sheet-formula injection (values starting with `=`, `+`, `-` on user input fields) must be neutralized on write (prefix escape); HTML/JS escaping in SPA rendering.
- Rate/abuse: quota guard on report exports.

**Incident handling:**
1. Contain: revoke access (set `active=false`, remove Drive ACLs), rotate secrets if leaked.
2. Investigate via `AuditLogs` (actor, action, before/after) + sheet version history.
3. Restore data if needed per `BACKUP_RECOVERY.md`.
4. Record incident in `CHANGELOG.md` (Security section) and this doc's run log; adjust tests to prevent recurrence.

```
## Security Incident Log
(date)  description  impact  action taken  prevention added
```

## 11. Future Expansion

- OAuth2 app with scoped service account for true multi-tenant isolation.
- 2FA enforcement per role; hardware-key support.
- Row-level encryption for financial columns (Sheets doesn't support natively; move to DB backend).
- VPC / Cloud Run deployment with IAM.
- SIEM export of audit log (JSON to Cloud Storage).

## 12. Cross-References

- Who can do what: `docs/ROLE_PERMISSIONS.md`
- Financial immutability: `docs/FINANCIAL_RULES.md §15`
- Audit storage: `docs/DATABASE_SCHEMA.md §2.4`
- Env & secrets setup: `docs/DEPLOYMENT_GUIDE.md §8`
- Restore after incidents: `docs/BACKUP_RECOVERY.md`
- Security test items: `docs/TESTING_CHECKLIST.md`