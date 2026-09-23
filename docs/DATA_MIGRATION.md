# Data Migration

The current Google Sheet remains untouched and is the migration source plus read-only archive.

## Import order

1. `clients`
2. `service_packages`
3. `bookings`
4. `payments`
5. `expenses`
6. `inventory_items`
7. `equipment`

## Before import

- Normalize dates to `YYYY-MM-DD`.
- Normalize package names against `service_packages`.
- Split location text and Google Maps URLs into separate fields.
- Treat every existing balance as a value to verify, not as the authority for future calculations.
- Do not import blank rows.
- Mark uncertain records for owner review instead of guessing.

## Financial invariant

Booking creation does not create a payment. A payment is a separate, auditable event. Balances are computed from posted payments, not manually typed totals.
