---
name: salikha-studio-os
description: Develop and maintain the Salikha Studio OS Next.js operations system with its localhost-only PostgreSQL test database, including UI features, data workflows, schema-aware changes, import tooling, and local QA.
metadata:
  short-description: Maintain Salikha Studio OS safely
---

# Salikha Studio OS

Use this skill for changes to this repository's operations dashboard, data model, local PostgreSQL API, migration tooling, and local QA.

## System context

- The app is a Next.js App Router frontend written in TypeScript and React.
- The test data system is standalone PostgreSQL 17 in Docker, accessed server-side through `lib/local-postgres.ts` and `app/api/local-db/route.ts`.
- `DATABASE_URL` must resolve to localhost. The API rejects remote database hosts; never add hosted credentials or `NEXT_PUBLIC_` database variables.
- `docker-compose.local.yml` binds PostgreSQL only to `127.0.0.1:55432`. Do not start Supabase or use its SDK/CLI.
- The local schema and seed are maintained in `database/schema.sql` and `database/seed.sql`.
- The current product is a clean rebuild and intentionally supports empty/zero-data states while approved Google Sheet data is migrated.
- `scripts/import-google-sheet.mjs` reads the approved Google Sheet and writes only to localhost PostgreSQL when explicitly invoked with `--apply`.

## Operating rules

1. Read the relevant component, schema table, and existing data flow before changing behavior.
2. Keep business rules and money calculations consistent with the database. Do not introduce fake production records or browser-only financial truth.
3. Keep database credentials server-side. Client components must call the same-origin local database API and must never import the PostgreSQL driver.
4. Preserve the local empty-state behavior. Treat browser localStorage only as a temporary UI fallback, not as shared PostgreSQL data.
5. For schema changes, update the migration SQL and all affected queries/forms together. Check enum values, generated columns, foreign keys, and RLS policies before coding against a new field.
6. Treat PostgreSQL health (`GET /api/local-db`) and frontend compilation as separate checks. Verify Docker container health and schema/seed contents directly.
7. Avoid destructive database or filesystem actions unless the user explicitly requests them and the exact target is confirmed.

## Preferred workflow

- Inspect the affected files and `git status` first; preserve unrelated user changes.
- Run `npm run typecheck` after code changes.
- Run `npm run build` when practical. If Windows reports `spawn EPERM`, record it as an environment/process limitation and still verify compilation and typechecking separately.
- Start the frontend with `npm run dev` and smoke-test `http://localhost:3000` when the task involves runtime behavior.
- For backend checks, report whether localhost PostgreSQL is reachable, healthy, and seeded. Never probe or write to Supabase/hosted databases.
- Review `git diff --check` before handoff.

## Feature areas

The dashboard currently includes overview metrics, bookings, clients, calendar, cashflow, expenses, inventory, equipment and maintenance, packages, reports, and settings/setup states. Shared UI lives primarily in `app/page.tsx`; focused forms and detail actions are separate files under `app/`.

When adding a feature, prefer the existing visual language and accessible semantic controls. Keep loading, empty, error, and successful-data states explicit. For mutations, write to localhost PostgreSQL first, then update the local view state only after handling the result; do not silently claim a failed write succeeded.

## Handoff expectations

Report:

- files changed and why;
- checks that passed;
- checks blocked by environment or external connectivity;
- whether local PostgreSQL was actually reachable and healthy;
- whether the local frontend is still running and its URL.
