# Salikha Studio OS

> A complete Business Operating System for Salikha Studio - photography, photobooth, and photoman operations.

Salikha Studio OS is **not just a booking system**. It manages the entire business: leads, clients, bookings, event production, event deployments, inventory, equipment, cashflow, payments, expenses, packages, purchasing, partners, crew, reports, files, and settings - from one application.

**Current phase: Sprint 9 - Stabilization & Release Readiness. See `PROJECT_STATUS.md`.**

## Business Purpose

The owner runs the business from one place. Workflows - not screens - drive the design:

- **Sell it:** Dashboard, Calendar, Leads, Clients, Bookings, Packages.
- **Do it:** Event Production, Deployments, Inventory, Equipment.
- **Count it:** Cashflow, Payments, Expenses, Receivables.
- **Understand it:** Reports and business analytics.
- **Govern it:** Settings, users, files.

The financial core follows one absolute rule: **cash balances come from verified cash transactions, never from booking totals.** See `docs/FINANCIAL_RULES.md`.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (single-page app) |
| Backend | Google Apps Script (V8) |
| Database | Google Sheets |
| Files | Google Drive (Sprint 8+) |
| Scheduling | Google Calendar (Sprint 8+) |
| Deployment | Google Apps Script Web App + clasp |
| Development | OpenCode, Git |

No frameworks, no build step, no external UI libraries.

## Repository Structure

```
salikha-studio-os/
├── AGENTS.md                 <- agent instructions (read first)
├── README.md                 <- you are here
├── CHANGELOG.md              <- version history
├── PROJECT_STATUS.md         <- living project tracker
├── .gitignore
├── .clasp.json.example       <- clasp template (never commit .clasp.json)
├── opencode.jsonc            <- OpenCode config loading docs
├── docs/                     <- the contract (13 documents)
└── src/                      <- clasp-compatible source root
    ├── appsscript.json       <- GAS manifest (Asia/Manila, V8); clasp requires it inside rootDir
    ├── Code.gs               <- doGet router + include helper
    ├── Config.gs             <- configuration access
    ├── ResponseService.gs    <- standard response envelope
    ├── ErrorService.gs       <- error normalization
    ├── LoggerService.gs      <- structured logging
    ├── ValidationService.gs  <- general validators
    ├── IdService.gs          <- immutable ID generation
    ├── DateService.gs        <- timezone-safe dates
    ├── SetupService.gs       <- initialization status
    ├── HealthService.gs      <- health endpoint
    ├── DatabaseService.gs    <- Sprint 1 sheet initialization (idempotent, lock-protected)
    ├── SheetSchemaService.gs <- canonical Sprint 1 sheet schemas
    ├── RepositoryService.gs  <- header-validated sheet repository
    ├── LockManager.gs        <- reentrant script locking (financial writes)
    ├── AuditService.gs       <- append-only audit logging
    ├── CashAccountService.gs <- cash accounts + ledger-derived balances
    ├── FinancialCategoryService.gs <- categories + system defaults
    ├── CashTransactionService.gs   <- the ledger: posting, voiding, idempotency
    ├── OpeningBalanceService.gs    <- opening balance workflow
    ├── TransferService.gs    <- atomic transfer pairs
    ├── ReconciliationService.gs    <- daily cash reconciliation
    ├── FinanceDashboardService.gs  <- preliminary financial summary
    ├── FinanceController.gs  <- server functions for the Cashflow page
    ├── index.html            <- main document
    ├── styles.html           <- all CSS (design tokens)
    ├── components.html       <- reusable UI helpers
    ├── app-shell.html        <- layout: sidebar, header, main
    ├── scripts.html          <- routing, health, toasts, drawer
    ├── IntegrationService.gs  <- spreadsheet/Drive/calendar verification (read-only, safe)
    ├── ClientRepository.gs    <- client/lead/note/interaction sheet access + normalization
    ├── ClientService.gs       <- client rules: duplicates, notes, interactions
    ├── LeadRepository.gs      <- lead sheet access + search
    ├── LeadService.gs         <- lead status machine + conversion
    ├── PackageRepository.gs   <- package/item/add-on sheet access
    ├── PackageService.gs      <- package profitability + item editor + add-ons
    ├── CustomerController.gs  <- client/lead server functions + home pulse
    ├── PackageController.gs   <- package server functions
    ├── BookingRepository.gs   <- booking/item/history sheet access
    ├── BookingPricingService.gs <- server-authoritative booking pricing
    ├── BookingStatusService.gs  <- booking status machine + history
    ├── BookingConflictService.gs <- schedule-conflict detection
    ├── BookingTimelineService.gs <- booking timeline feed
    ├── BookingService.gs      <- booking orchestration + cancellation/reschedule
    ├── PaymentRepository.gs   <- payments/allocations/refunds sheet access
    ├── ReceivableService.gs   <- receivables + server-computed payment status
    ├── PaymentService.gs      <- payment posting/voiding with ledger pairing
    ├── RefundService.gs       <- refund foundation with eligibility checks
    ├── BookingController.gs   <- booking server functions
    ├── PaymentController.gs   <- payment/receivable/refund server functions
    ├── finance-page.html      <- Cashflow page markup
    ├── finance-components.html <- Cashflow form/detail templates
    ├── finance-scripts.html   <- Cashflow page controller
    ├── settings-page.html     <- Settings: Google integrations cards
    ├── settings-scripts.html  <- Settings controller
    ├── clients-page.html      <- Clients page
    ├── leads-page.html        <- Leads page
    ├── packages-page.html     <- Packages + add-ons page
    ├── customer-components.html <- client/lead templates
    ├── customer-scripts.html  <- Clients/Leads controller
    ├── package-components.html <- package/add-on/item templates
    └── package-scripts.html   <- Packages controller
    ├── bookings-page.html     <- Bookings page
    ├── booking-detail.html    <- Booking detail workspace (tabs)
    ├── booking-components.html <- booking/payment templates
    ├── booking-scripts.html   <- Bookings + Calendar controller
    ├── calendar-page.html     <- Internal booking calendar (no Google Calendar)
    ├── payments-page.html     <- Payments + Receivables page
    └── payment-scripts.html   <- Payments controller
```

Automated tests: `test/sprint1-tests.js` (Node harness with in-memory GAS mocks - run `node test/sprint1-tests.js`; 263 checks).

## Google Integrations (Pre-Sprint 2)

The system connects to three Google resources via Script Properties (values are server-only, never shown in the UI):

| Resource | Property | Status surface |
|---|---|---|
| Business database spreadsheet | `SPREADSHEET_ID` | Cashflow + Settings |
| Root Drive folder | `ROOT_DRIVE_FOLDER_ID` | Settings |
| Business calendar | `CALENDAR_ID` | Settings |

Configure the resources per `docs/DEPLOYMENT_GUIDE.md §12a`, re-authorize the script, then run **Settings > Check Connections**. The health status in the sidebar shows spreadsheet/Drive/calendar connectivity.

## Documentation Map

| Document | Read when |
|---|---|
| `docs/VISION.md` | Understanding why the product exists |
| `docs/PRODUCT_REQUIREMENTS.md` | Defining what each module does |
| `docs/DATABASE_SCHEMA.md` | Working with the data contract |
| `docs/FINANCIAL_RULES.md` | Touching anything financial (highest priority) |
| `docs/BUSINESS_WORKFLOWS.md` | Sequencing business processes |
| `docs/DESIGN_SYSTEM.md` | Building or restyling UI |
| `docs/ROLE_PERMISSIONS.md` | Implementing authorization |
| `docs/IMPLEMENTATION_PLAN.md` | Deciding what to build next |
| `docs/TESTING_CHECKLIST.md` | Verifying work |
| `docs/DEPLOYMENT_GUIDE.md` | Deploying with clasp |
| `docs/REPORT_DEFINITIONS.md` | Building or checking reports |
| `docs/BACKUP_RECOVERY.md` | Protecting data |
| `docs/SECURITY_MODEL.md` | Security and audit |

## Prerequisites

- Node.js (for clasp)
- Google account (Apps Script, Sheets, Drive, Calendar)
- Git

## Installation

```bash
# 1. Install clasp globally
npm install -g @google/clasp

# 2. Log in to Google
clasp login

# 3. Create a script project (or use an existing one)
#    Copy its Script ID into .clasp.json (copy from .clasp.json.example)

# 4. Push the source
clasp push
```

## clasp Setup

- `.clasp.json.example` is the committed template. Copy it to `.clasp.json` and fill in the real Script ID.
- `.clasp.json` is gitignored - never commit real script IDs.
- `rootDir` is `src`; all `.gs` and `.html` files under it are pushed, including `appsscript.json` (clasp requires the manifest inside the rootDir).
- Full instructions: `docs/DEPLOYMENT_GUIDE.md`.

## Local Workflow

1. Read `AGENTS.md` and the docs governing the feature.
2. Implement in `src/` following the active sprint scope.
3. Push to the development project with `clasp push`.
4. Verify against `docs/TESTING_CHECKLIST.md`.
5. Update `CHANGELOG.md`, touched docs, and `PROJECT_STATUS.md`.

## Commands

| Command | Purpose |
|---|---|
| `clasp login` | Authenticate clasp |
| `clasp push` | Push `src/` to the script project |
| `clasp pull` | Pull remote files locally |
| `clasp status` | Show local vs remote differences |
| `clasp versions` | List deployment versions |
| `clasp deploy` | Create a deployment version |

## Deployment Overview

- Environments: Development, Test, Production (separate projects).
- Web app: `Execute as: User accessing the web app`, access `Anyone with Google account`.
- Sprint 0 runs with **no script properties**; defaults come from `Config.gs`. Sprint 1 requires `SPREADSHEET_ID` for database initialization (see `docs/DEPLOYMENT_GUIDE.md` §8a).
- Script properties (Sprint 1+): `SPREADSHEET_ID`, `ROOT_DRIVE_FOLDER_ID`, `CALENDAR_ID`, `APP_ENV`, `BUSINESS_TIMEZONE`, `BUSINESS_CURRENCY`.
- See `docs/DEPLOYMENT_GUIDE.md`.

## Contribution Rules

- Follow `AGENTS.md`. The docs are the contract.
- No unapproved features; implement only the active sprint.
- Never commit `.clasp.json`, secrets, or real Google IDs.
- Financial logic must never be reimplemented in the frontend.
- Record verification results honestly in `docs/TESTING_CHECKLIST.md`.

## Current Status

- Phase: Sprint 7 - Reports, Dashboard, and CSV export (implemented + review-hardening pass; 757/757 automated checks; pending owner migration + review).
- Version: `0.8.0-reports-analytics`.
- Sprint 7 delivers: the full R1-R16 report suite with backend-computed data and scope statements, the business dashboard (money/booking/alerts/charts), and formula-safe CSV export.
- Next: owner runs `clasp push --force` + redeploys the web app, then a Sprint 7 review; then Sprint 8 (documents and automation).
- Details: `PROJECT_STATUS.md`.

## License

Proprietary - Salikha Studio. Internal use until commercial release decision.