# Salikha Studio OS QA review — October 31, 2026

## Scope

Source review, typechecking, production build, isolated financial calculations, and read-only browser smoke checks. No production payments, inventory movements, outgoing client messages, or user-account changes are made for QA.

## Changes

- Shared status badges pair text and icons with success, warning, information, danger, and neutral colors.
- Financial receipt and completion actions use green; cash-out and consumption use amber; transfers and utility actions use blue; voids and errors use red. The studio brand remains the primary navigation color.
- Booking status is separate from the Complete event / Collect payment actions.
- Reports distinguish inflows, costs, reconciliation exceptions, and profit/loss. Errors no longer look like ordinary warnings.
- Cards, table rhythm, form actions, and mobile booking schedule/balance summaries share consistent styling.
- Booking register has explicit loading and failed-load/retry states instead of premature empty records.
- Dashboard loading follows the actual query lifecycle, preserves Calendar connection readiness, and does not issue its seven summary queries on every tab change.
- Booking date filters use Philippine calendar dates and include today's events in Next 30 days.
- Calendar connection checking no longer flashes a false OAuth-setup requirement.

## Checks

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Optimized Next.js production build | Passed |
| Financial calculation / validation scenarios | 19 passed, using isolated in-memory fixtures |
| Transactional database integration suite | Blocked this run: Docker Desktop fails to initialize its inference-service socket; PostgreSQL container cannot start |
| Desktop browser smoke review | Passed: Overview, Bookings, Clients, Calendar, Cashflow, Inventory, Equipment, Packages, Reports, Invoices, Team access; light and dark themes; no page-level horizontal overflow or immediate alert errors |
| Settings | Rendered and controls inspected; settings were not changed |
| Booking date filter | Next 30 days retains the October 31 booking as well as November 1 |
| Receipt form | Required amount, minimum PHP 0.01, maximum equal to the selected booking balance verified; no posting submitted |
| Cashflow and revenue PDF exports | Downloaded from the live app, rendered, and visually reviewed without clipping |
| Mobile visual review | Not verified: browser viewport override was accepted but actual width remained desktop-sized; override reset. Mobile breakpoint CSS reviewed only |

Calculation coverage: paid deposits versus earned service revenue; internal transfers; owner capital and loans; posted versus voided cash; unpaid direct costs; unconsumed inventory purchases; consumption and returns; outstanding balances; prior/future dates; decimal precision and invalid dates.

Reproduce calculation checks with `node scripts/verify-calculations.mjs`. Database transaction checks are in `scripts/verify-workflows.mjs` and require a healthy localhost PostgreSQL container and local Next.js server. The earlier 52-assertion integration result is historical and is not counted as a fresh pass in this review.

## Limits

This is application QA, not an independent audit of the studio's books or exhaustive security testing. Database-backed write workflows must be rerun once local Docker is healthy. External delivery of emails/chat messages and Google OAuth consent are not exercised by this review.

## Release evidence

Code release: `2e50698` (Vercel Production Ready).

Screenshots: `tmp/qa-semantic-cashflow-light.png`, `tmp/qa-semantic-cashflow-dark.png`. Export renders: `tmp/qa-live-cashflow-pdf.png`, `tmp/qa-live-revenue-pdf.png`.

No database schema changes were required. Local PostgreSQL was unavailable because Docker Desktop could not initialize; the local transaction server/suite was not started for this review.
