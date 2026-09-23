# Salikha Studio OS

Internal operations system for Salikha Studio. This is the clean rebuild of the legacy Google Apps Script and Google Sheets application.

## Current Stage

The first vertical slice is the responsive operations dashboard foundation. It displays zero-data states until approved records are imported into the local PostgreSQL test database. No production data is mocked.

## Stack

- Next.js and React
- TypeScript with strict mode
- CSS design tokens and accessible semantic HTML
- PostgreSQL 17 for the local test database
- Next.js server API with a loopback-only database connection

## Run locally

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm run build
```

## Local database testing

The test environment uses a standalone PostgreSQL 17 container. Supabase
packages, services, APIs, Auth, Storage, and hosted database URLs are not used by the app.
The database port is bound to `127.0.0.1` only. Docker Desktop must be running.

Set `DATABASE_URL` in `.env.local` to the local-only example in `.env.example`,
then run `npm run db:start`, `npm run db:status`, and `npm run dev`. The backend
health check is available at `/api/local-db`. Schema and baseline cash accounts
are initialized from `database/schema.sql` and `database/seed.sql` when the database volume is first
created. `npm run db:reset` reapplies the destructive schema reset and should
only be used for disposable test data. Stop the database with `npm run db:stop`.

## Google Sheet import

The current `CLIENT RECORDS` tab can be inspected safely with a dry run:

```bash
node scripts/import-google-sheet.mjs
```

Applying records writes only to localhost PostgreSQL and requires `DATABASE_URL`:

```bash
$env:DATABASE_URL="postgresql://salikha:salikha_local_dev_only@127.0.0.1:55432/salikha"
node scripts/import-google-sheet.mjs --apply
```

The importer rejects non-local database hosts. Google Sheets remains a read-only source.

## Product rules

- The Google Sheet is a migration source and read-only archive, not the long-term system of record.
- Money calculations and permissions belong on the server/database, never only in the browser.
- Every important mutation must be auditable and idempotent.
- No real client, booking, or financial data is committed to the repository.

## Legacy archive

The pre-rebuild working tree was archived outside this workspace before the clean build. The Google Sheet itself remains untouched until the new system passes owner verification.
