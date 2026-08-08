# AGENTS.md

> Strict instructions for AI development agents (OpenCode) working on Salikha Studio OS.

## Purpose

Define how agents must behave when implementing, modifying, or extending Salikha Studio OS. These rules exist because the project has hard architectural, financial, and quality constraints that must never be violated, even when the agent believes it is being helpful.

## Scope

Every future OpenCode session in this repository. Covers conventions, forbidden patterns, workflow, and the definition of done.

## Overview

Salikha Studio OS is a design-first, cash-first business operating system. The documentation in `docs/` is the contract. When in doubt, the documentation wins. When the documentation is silent, `FINANCIAL_RULES.md` and `DATABASE_SCHEMA.md` take precedence over everything else.

---

## Table of Contents

1. [Ground Rules](#1-ground-rules)
2. [Read Before You Edit](#2-read-before-you-edit)
3. [Documentation Is the Contract](#3-documentation-is-the-contract)
4. [Architecture Conventions](#4-architecture-conventions)
5. [Naming Conventions](#5-naming-conventions)
6. [Financial Invariants](#6-financial-invariants)
7. [Data Layer Rules](#7-data-layer-rules)
8. [Frontend Rules](#8-frontend-rules)
9. [Security Rules](#9-security-rules)
10. [Testing Requirements](#10-testing-requirements)
11. [Workflow for Agents](#11-workflow-for-agents)
12. [Forbidden Patterns](#12-forbidden-patterns)
13. [Definition of Done](#13-definition-of-done)
14. [Cross-References](#14-cross-references)

---

## 1. Ground Rules

1. **Read documentation before editing.** Every feature maps to a documented module, schema, and workflow.
2. **Inspect current code first.** Never assume what exists; list files and read before changing.
3. **Implement only the active sprint.** Scope comes from `docs/IMPLEMENTATION_PLAN.md`. Do not jump ahead.
4. **Do not add unapproved features.** New ideas go to the owner or the backlog, not into code.
5. **Do not redesign existing pages without approval.** Visual changes follow `docs/DESIGN_SYSTEM.md`.
6. **Preserve working code.** Do not delete or overwrite files without a justified reason.
7. **Ask before deciding.** Ambiguous requirements are clarified with concrete options, never guessed.
8. **Keep functions small and modular.** Separate UI, business logic, and storage logic.
9. **Never hardcode sheet column indices.** Always use the header map.
10. **Never use spreadsheet row numbers as permanent IDs.**
11. **Never hard-delete financial records.** Soft-delete or void.
12. **Never calculate cash from booking totals.**
13. **Follow the documented financial rules.** `docs/FINANCIAL_RULES.md` overrides all.
14. **Follow the documented database schema.** `docs/DATABASE_SCHEMA.md` is the data contract.
15. **Follow the documented design system.** Tokens only; no ad-hoc colors.
16. **Use batch spreadsheet reads and writes.** Avoid unnecessary full-sheet reads.
17. **Validate data on both client and server.**
18. **Prevent duplicate submissions** (idempotency keys on money operations).
19. **Use LockService for critical future transactions.**
20. **Escape user-provided output.** Never inject untrusted strings into the DOM.
21. **Add audit entries for important operations.**
22. **Update documentation when behavior changes.** Docs and `CHANGELOG.md` move with code.
23. **Update `PROJECT_STATUS.md` after each completed task.**
24. **Run relevant tests before declaring completion.** Do not claim something works without verifying it.

## 2. Read Before You Edit

- List the repository (`README.md`, `PROJECT_STATUS.md` first).
- Read the docs that govern the feature being touched.
- Read the existing source files that interact with the change.
- Only then write code.

## 3. Documentation Is the Contract

| Document | What agents must obey |
|---|---|
| `docs/VISION.md` | Product direction and principles |
| `docs/PRODUCT_REQUIREMENTS.md` | What features exist and what they do |
| `docs/DATABASE_SCHEMA.md` | Exact sheet names, columns, types, IDs, keys |
| `docs/FINANCIAL_RULES.md` | All money rules; highest priority for financial work |
| `docs/BUSINESS_WORKFLOWS.md` | Process sequencing; state transitions must match |
| `docs/DESIGN_SYSTEM.md` | UI tokens, components, and behavior |
| `docs/ROLE_PERMISSIONS.md` | Authorization matrix; every backend call enforces it |
| `docs/IMPLEMENTATION_PLAN.md` | Sprint scope; do not jump ahead |
| `docs/TESTING_CHECKLIST.md` | What to verify and how to record results |
| `docs/DEPLOYMENT_GUIDE.md` | Deployment and environment procedures |
| `docs/REPORT_DEFINITIONS.md` | Exact report calculations and outputs |
| `docs/BACKUP_RECOVERY.md` | Backup and restore procedures |
| `docs/SECURITY_MODEL.md` | Auth flows, audit logging, secret handling |

Conflict resolution order: **FINANCIAL_RULES → DATABASE_SCHEMA → SECURITY_MODEL → BUSINESS_WORKFLOWS → PRODUCT_REQUIREMENTS → DESIGN_SYSTEM → others.**

## 4. Architecture Conventions

```
src/
├── Code.gs                 <- doGet/doPost router + auth gate
├── Config.gs               <- configuration access (Properties Service)
├── ResponseService.gs      <- standard response envelope
├── ErrorService.gs         <- error normalization and codes
├── LoggerService.gs        <- structured logging
├── ValidationService.gs    <- general-purpose validators
├── IdService.gs            <- immutable ID generation
├── DateService.gs          <- timezone-safe dates
├── SetupService.gs         <- initialization status
├── HealthService.gs        <- health endpoint
├── index.html / styles.html / scripts.html / components.html / app-shell.html
├── services/  (future)     <- one module per domain
├── data/      (future)     <- sheet access layer
├── reports/   (future)     <- report query services
├── domain/    (future)     <- pure rule helpers
└── core/      (future)     <- auth, audit, config, errors, utils
```

- Services receive a request context `{ user, role, ip, timestamp, requestId }` and never read `Session` directly (the router does that).
- Sheet access is centralized in the data layer (future sprints); no service touches `SpreadsheetApp` directly except the data layer.
- ID generation is centralized (`IdService`). Never hand-roll IDs.
- Errors are typed and returned as the standard envelope `{ success, data, message, error, timestamp }`.
- Every mutation writes an audit entry (Sprint 1+).
- Time is always business timezone (Asia/Manila); currency is always a number (PHP).

## 5. Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Sheets | `PascalCase`, per `DATABASE_SCHEMA.md` | `EventDeployments`, `CashTransactions` |
| Columns | `camelCase`, descriptive | `clientId`, `revenueTotal` |
| IDs | `PREFIX-YYYY-XXXXXXXX` via IdService | `BKG-2026-5R9J8D3W` |
| Status enums | `UPPER_SNAKE_CASE` | `RECONCILED`, `PENDING` |
| Colors | CSS custom property only | `var(--color-primary)` |
| API actions | `module.action` dotted strings (future) | `booking.save` |
| Roles | `OWNER`, `ADMIN`, `FINANCE`, `OPERATIONS`, `CREW`, `VIEWER` | |

Complete tables: `docs/DATABASE_SCHEMA.md` (§11 enums, §12 prefixes).

## 6. Financial Invariants

1. Cash balance = sum of verified cash transactions per account. Never sum bookings.
2. `CAPITAL_IN` and `WITHDRAWAL` are owner-fund movements - never revenue or expense.
3. Transfers are dual-sided, non-income movements between accounts.
4. Inventory purchase increases stock value; inventory usage is a direct event cost. Never the reverse.
5. Equipment purchases are capital assets, never operating expenses.
6. Every cash transaction is immutable once VERIFIED; corrections create a reversal + new transaction.
7. Receivables are based on valid charges and valid (verified) payments only.
8. Reports distinguish cash basis from operational (accrual) profitability.
9. Every report that touches money states which transactions it includes.
10. Financial records are never physically deleted.

## 7. Data Layer Rules

- Use a column header to value map from row 1 of each sheet; never hard-code indices.
- Batch all writes; single `SpreadsheetApp` flush per request where possible.
- Service-layer validation is the trust boundary; sheet dropdowns are UX only.
- Never physically delete rows on data sheets that feed financial reports. Only `Scratch` may be cleared.
- Keep `docs/DATABASE_SCHEMA.md` in sync with the workbook at all times.

## 8. Frontend Rules

- Single-page application; vanilla JS; no framework; no build step.
- Every interaction calls the backend via `google.script.run`; no fake local data paths.
- All tokens come from `src/styles.html` custom properties per `docs/DESIGN_SYSTEM.md`.
- Loading, empty, and error states are mandatory for every screen that fetches data.
- Modals and toasts follow the component templates in `src/components.html`.
- Navigation is hash-based; state persists during the session.
- No emojis as icons; inline SVG line icons only.

## 9. Security Rules

- UI hiding is never authorization; the backend enforces `ROLE_PERMISSIONS.md`.
- Escape all dynamic HTML output; never inject untrusted strings with `innerHTML`.
- Never expose Script Properties, secrets, or stack traces to the browser.
- Do not log secrets or full financial payloads.
- Avoid inline event handlers; use `addEventListener`.
- Do not implement fake authentication; Google OAuth establishes identity.
- See `docs/SECURITY_MODEL.md` for the complete model.

## 10. Testing Requirements

- Follow `docs/TESTING_CHECKLIST.md` per sprint; record results.
- Financial calculations are verified against hand-computed fixtures in `FINANCIAL_RULES.md` and `REPORT_DEFINITIONS.md`.
- Test data never mixes with production data.
- Before marking a sprint complete, run every relevant checklist item and record the results.
- Verify what you claim: run the check, see the result.

## 11. Workflow for Agents

1. **Read first.** Relevant docs + current code.
2. **Plan.** Maintain a todo list; one item in progress.
3. **Implement in small slices.** Current sprint scope only.
4. **Verify.** Run applicable tests/checks; fix before finishing.
5. **Document.** Update `CHANGELOG.md`, touched docs, and `PROJECT_STATUS.md`.
6. **Report.** Summarize what changed, what was verified, and any deviations.

## 12. Forbidden Patterns

- Computing cash from bookings.
- Hard-coded sheet column indices.
- Client-side business rule duplication.
- `Session.getActiveUser()` trust without role check.
- Physical deletion of financial rows.
- Editing the schema without updating `docs/DATABASE_SCHEMA.md`.
- Single-file monoliths (no 2000-line `Code.gs`).
- Storing secrets in code or sheets.
- New dependencies without user approval.
- Implementing features outside the active sprint.
- Claiming completion without verification.

## 13. Definition of Done

A task is done only when **all** of the following are true:

- [ ] Behavior matches the documentation contract.
- [ ] Financial invariants hold (where financial).
- [ ] Backend enforces authorization per `ROLE_PERMISSIONS.md`.
- [ ] Audit entry written for every mutation (Sprint 1+).
- [ ] Data-layer access through the central data layer (Sprint 1+).
- [ ] Frontend uses design-system tokens and mandatory states.
- [ ] Relevant `TESTING_CHECKLIST.md` items pass and are recorded.
- [ ] `CHANGELOG.md` updated.
- [ ] `docs/` updated if behavior or schema changed.
- [ ] `PROJECT_STATUS.md` updated.

## 14. Cross-References

- `README.md` - project overview and document map
- `PROJECT_STATUS.md` - living project tracker
- `docs/FINANCIAL_RULES.md` - rules that overrule everything
- `docs/DATABASE_SCHEMA.md` - the data contract
- `docs/SECURITY_MODEL.md` - auth, audit, secrets
- `docs/IMPLEMENTATION_PLAN.md` - what to build and in what order