# DEPLOYMENT_GUIDE.md

## Purpose

Complete procedures for creating, deploying, updating, and maintaining Salikha Studio OS on Google Apps Script: accounts, project creation, clasp, deployments, configuration, versions, rollback, and troubleshooting. No real secrets or IDs are included.

## Scope

- Account and project preparation.
- clasp installation and workflow.
- Development and production deployments.
- Execution identity, access, and script properties.
- Spreadsheet, Drive, and Calendar configuration.
- Versioning, rollback, and troubleshooting.

## Overview

Three environments: Development (active coding), Test (QA), Production (the business). Each has its own script project, workbook, Drive root, and calendar. Only IDs and properties differ â€” code is identical.

---

## Table of Contents

1. [Google Account Preparation](#1-google-account-preparation)
2. [Apps Script Project Creation](#2-apps-script-project-creation)
3. [Google Cloud Project Considerations](#3-google-cloud-project-considerations)
4. [Installing clasp](#4-installing-clasp)
5. [Logging into clasp](#5-logging-into-clasp)
6. [clasp Push and Pull](#6-clasp-push-and-pull)
7. [clasp Configuration](#7-clasp-configuration)
8. [Development Deployment](#8-development-deployment)
9. [Production Deployment](#9-production-deployment)
10. [Execution Identity and Access](#10-execution-identity-and-access)
11. [Script Properties](#11-script-properties)
12. [Spreadsheet Configuration](#12-spreadsheet-configuration)
13. [Drive Folder Configuration](#13-drive-folder-configuration)
14. [Calendar Configuration](#14-calendar-configuration)
15. [Version Updates](#15-version-updates)
16. [Rollback](#16-rollback)
17. [Common Errors](#17-common-errors)
18. [Permission Troubleshooting](#18-permission-troubleshooting)
19. [Deployment Pitfalls (learned in Sprint 0)](#19-deployment-pitfalls-learned-in-sprint-0)
20. [Cross-References](#20-cross-references)

---

## 1. Google Account Preparation

- Use the studio's Google Workspace or Gmail account for the script project.
- Recommended: a dedicated operational account (e.g., `ops@salikha.example`) that owns the spreadsheet, Drive root, and calendar, shared only with approved users.
- The developer's own account is used for clasp login.

## 2. Apps Script Project Creation

1. Visit `script.google.com` and create a new project (standalone).
2. Copy the Script ID from Project Settings. It goes into `.clasp.json` (never committed - see `.clasp.json.example`).
3. Create the bound resources in later steps: the spreadsheet is separate; the script is standalone and references it by ID.

## 3. Google Cloud Project Considerations

- Apps Script automatically provisions a default Google Cloud project.
- For v1.0: leave default unless custom OAuth consent screen or advanced services are required.
- When Drive/Calendar APIs are needed (Sprint 8), enable the corresponding advanced services in the Apps Script editor; for Drive API v3/Calendar API choose the matching GCP project settings.
- Never generate a service-account key for the web app in v1.0.

## 4. Installing clasp

```bash
npm install -g @google/clasp
```

Verify: `clasp --version`.

## 5. Logging into clasp

```bash
clasp login
```

Opens browser OAuth; authorize the Google Apps Script scopes. Use `clasp login --creds <path>` only when a GCP OAuth client ID is required (not for v1.0).

## 6. clasp Push and Pull

- The project source lives in `src/` (rootDir configured in `.clasp.json`).
- Push all files: `clasp push`
- Pull latest from script.google.com: `clasp pull`
- Show remote files: `clasp status`
- List versions: `clasp versions`

All `.gs` and `.html` files in `src/` are pushed, plus the Apps Script manifest. Important: `appsscript.json` must live **inside the configured rootDir** (`src/appsscript.json`) - clasp will not find the manifest at the repository root when `rootDir` is set.

## 7. clasp Configuration

`.clasp.json` (local, gitignored; template in `.clasp.json.example`):

```json
{
  "scriptId": "REPLACE_WITH_YOUR_SCRIPT_ID",
  "rootDir": "src",
  "projectId": ""
}
```

## 8. Development Deployment

1. `clasp push` to the development script project.
2. Deploy > New deployment > Web app.
3. Execute as: User accessing the web app. Who has access: Anyone with Google account (v1.0).
4. Keep a second deployment with the same code for QA testing.

## 8a. Sprint 1 Database Setup (owner steps)

1. Create a new Google Spreadsheet named `Salikha Studio OS (DB)` (or reuse an approved one).
2. Copy the Spreadsheet ID (from the URL: `/spreadsheets/d/<ID>/edit`).
3. Apps Script project > Project Settings > Script Properties: add `SPREADSHEET_ID` = the ID.
4. Push the code (`clasp push --force`), redeploy, open the web app, go to **Cashflow**.
5. The Cashflow page shows "not configured" or "not initialized". Click **Initialize database** (server function `initializeSprint1Database()`).
6. Confirm the Sprint 1 sheets are created with correct headers and schema version `2.0.0` in SystemMetadata (Sprint 2 adds seven more sheets).
7. Create cash accounts with verified opening balances (never invent balances).
8. Run the Sprint 1 test scenario from `docs/TESTING_CHECKLIST.md` and verify balances.

Notes: initialization is idempotent and lock-protected; mismatched headers raise `SCHEMA_MISMATCH` and nothing is altered; no sample financial transactions are ever created by initialization.

## 9. Production Deployment

1. Create a separate production script project + workbook (never reuse dev).
2. Push the same code: `clasp push`.
3. Create a new Web App deployment, tag version `1.0.0`.
4. Set production Script Properties (see below).
5. Restrict editor access on the workbook and Drive root to approved users.

## 10. Execution Identity and Access

- Web app runs as the calling user (`Execute as: User accessing the web app`). Users must have at least Viewer access to the spreadsheet/Drive folders used, or calls fail with permission errors.
- Every call is authorized server-side per `docs/ROLE_PERMISSIONS.md`; the Users sheet gates actions.
- Google OAuth establishes identity; no passwords in-app.

### 10.1 Integration execution identity (Pre-Sprint 2)

Drive and Calendar access depends on **the account that executes the script**. For the internal Version 1, the approved deployment is:

```text
Execute as: User accessing the web app (development: the owner's account)
Access: Owner only / approved users - never public
```

The executing account must have edit access to the spreadsheet, the Drive root folder, and the business calendar. Do not change deployment access automatically; document any change in `PROJECT_STATUS.md`.

### 10.2 OAuth scopes (inferred)

`appsscript.json` declares **no explicit `oauthScopes`** - Apps Script infers scopes from the services actually used. After this configuration, the first run will request:

| Service | Inferred scope | Why |
|---|---|---|
| SpreadsheetApp | `https://www.googleapis.com/auth/spreadsheets` (+ `drive.file`) | Database access (Sprint 1) |
| DriveApp | `https://www.googleapis.com/auth/drive` | Folder verification (DriveApp requires the broad Drive scope) |
| CalendarApp | `https://www.googleapis.com/auth/calendar` | Calendar verification (Sprint 8 workflows) |

No Gmail, contacts, or unrelated scopes are requested. **The owner must re-authorize the script after deployment** so these scopes are granted; authorization is only complete after a successful runtime `getIntegrationStatus()`.

## 11. Script Properties

Stored in Project Settings > Script Properties. Never in code or sheets.

| Key | Purpose | Required |
|---|---|---|
| `APP_ENV` | `development` / `test` / `production` | optional (default development) |
| `SPREADSHEET_ID` | Database workbook ID | Sprint 1+ |
| `ROOT_DRIVE_FOLDER_ID` | Drive root folder | Pre-Sprint 2 integration |
| `CALENDAR_ID` | Business calendar | Pre-Sprint 2 integration |
| `BUSINESS_TIMEZONE` | Default Asia/Manila | optional (default Asia/Manila) |
| `BUSINESS_CURRENCY` | Default PHP | optional (default PHP) |

Sprint 0 runs with no properties set; `Config.gs` applies safe defaults and reports `configReady: false`. Property values are trimmed and placeholder values (e.g., `REPLACE_WITH_YOUR_SCRIPT_ID`) are rejected. Values are never returned to the frontend - only readiness statuses are.

## 12. Spreadsheet Configuration

- Created in Sprint 1 by the sheet-initialization service using the sheet list in `docs/DATABASE_SCHEMA.md`.
- Header rows are the contract; no hand-editing of headers.
- The spreadsheet ID goes into Script Properties.

## 12a. Google Integrations (Pre-Sprint 2 owner checklist)

### Business database spreadsheet
1. Open Google Sheets and create a blank spreadsheet.
2. Name it `Salikha Studio OS Database`.
3. Copy the spreadsheet ID (the value between `/d/` and `/edit` in the URL).
4. Add it to Script Properties as `SPREADSHEET_ID`.
5. Open the Cashflow page and run database initialization (creates the 6 Sprint 1 sheets).
6. Verify the sheets and schema version 2.0.0 on the Settings page.

### Root Drive folder
1. Open Google Drive and create a folder named `Salikha Studio OS Files`.
2. Keep it private (owner only).
3. Copy the folder ID (the value after `/folders/` in the URL).
4. Add it to Script Properties as `ROOT_DRIVE_FOLDER_ID`.
5. Do not create booking folders or upload files yet - Drive workflows arrive in Sprint 8.

### Business calendar
1. Open Google Calendar settings and create a calendar named `Salikha Studio Events`.
2. Set its timezone to `Asia/Manila`.
3. Copy its Calendar ID (calendar settings > calendar ID; may be the account email for a primary calendar).
4. Add it to Script Properties as `CALENDAR_ID`.
5. No events are created or modified by verification.

### After configuring
1. Re-authorize the script (new scopes).
2. Run `getIntegrationStatus()` from the Apps Script editor (or open Settings > Check Connections in the web app).
3. Confirm all three resources report `CONNECTED` and the calendar timezone is `Ready`.
4. `clasp push --force`, redeploy, and confirm the health banner shows all integrations connected.

## 13. Drive Folder Configuration

- Root folder created as `Salikha Studio OS Files` (Pre-Sprint 2 integration step; see Â§12a).
- Future structure per `docs/BACKUP_RECOVERY.md` and the Files module (`Clients/`, `Bookings/`, `Reports/`, `Backups/`, `Templates/`). Subfolders are created by future sprints, never by integration verification.
- Folder ID goes into Script Properties.

## 14. Calendar Configuration

- One business calendar (created in Sprint 8).
- Calendar ID goes into Script Properties.
- Events mirror confirmed bookings only (two-way best effort, SyncLog tracked).

## 15. Version Updates

1. Implement and verify in dev (unit tests + manual pass per `docs/TESTING_CHECKLIST.md`).
2. Push to test env; run the relevant checklist section.
3. Create a new deployment version in the production project (`clasp deploy` or the editor's Deploy dialog).
4. Update `CHANGELOG.md` and `PROJECT_STATUS.md`.

## 16. Rollback

- Google keeps deployment version history: redeploy the previous version in seconds.
- Data is untouched (lives in the spreadsheet, not the deployment).
- For data-level issues, follow `docs/BACKUP_RECOVERY.md`.

## 17. Common Errors

| Symptom | Cause / fix |
|---|---|
| `clasp: command not found` | Install: `npm install -g @google/clasp` |
| `Error: No matching deployment` | No web app deployment exists; create one |
| Push fails `rootDir` wrong | `.clasp.json` rootDir must point to `src` |
| `doGet` blank page | `index.html` not included correctly; check `include()` names |
| `403 FORBIDDEN` on call | User not in Users sheet, or role insufficient |
| `Authorization required` | User lacks spreadsheet/Drive access; grant Viewer+ |
| Execution timeouts (6 min) | Batch writes; reduce rows per request |
| Quota exceeded | Reduce full-sheet reads; use targeted ranges |

## 18. Permission Troubleshooting

1. Confirm the user is in the `Users` sheet with the right role.
2. Confirm the user has at least Viewer access to the spreadsheet and any Drive folders the called function touches.
3. Check execution logs (Logger/console) for the failing entry point.
4. Re-deploy with a new version after code changes (old deployments keep old code).

## 19. Deployment Pitfalls (learned in Sprint 0)

1. **`Script function not found: doGet`** almost always means the deployment was created against a project version that has no `Code.gs`/`Code.js` (e.g., a fresh `clasp create` project deployed before the first push). Fix: push the code, create a new version, and redeploy.
2. **`clasp push` without `--force` refuses to overwrite the remote `appsscript.json`** and can abort the whole push. Use `clasp push --force` when the manifest exists remotely.
3. **Never run `clasp pull` in the project directory with `rootDir: "src"`** unless you intend to import remote files: it pulls `.js`-named copies (the Apps Script API stores code files as `.js` regardless of the local `.gs` extension) next to your `.gs` files and overwrites your local `appsscript.json`. If it happens: delete the `*.js` duplicates and restore `appsscript.json` (timezone `Asia/Manila`).
4. **Manifest changes can invalidate existing web app deployments** (the URL may start returning a generic Drive "file not found" page). After any `appsscript.json` change, create a fresh deployment and update any bookmarked URLs.
5. **`clasp status` may list every file as `filesToPush` when `rootDir` is set** (path-prefix comparison quirk in clasp 3.x). Verify remote state with `clasp pull` into a scratch directory instead of trusting `status`.

## 20. Cross-References

- Workbook spec: `docs/DATABASE_SCHEMA.md`
- Security and secrets: `docs/SECURITY_MODEL.md`
- Backups and restore: `docs/BACKUP_RECOVERY.md`
- Verification: `docs/TESTING_CHECKLIST.md`
- Environment status: `PROJECT_STATUS.md`
