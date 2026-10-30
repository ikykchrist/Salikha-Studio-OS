# Operations and finance workflow

## Daily use

1. Add or select the client, then create the booking. Bookings start in the active/pending view.
2. Use **Collect payment** to record a deposit or balance with its actual date and receiving account. A payment updates the booking and cash ledger atomically. Completing an event never invents a payment.
3. Full payment is required before **Mark done**. Done and cancelled bookings appear in the Archive filter; records remain available for reports.
4. Use **Close out usage** for actual event consumption. Enter only transport/salary costs not already entered in Cashflow. These costs start unpaid; pay them from Cashflow → Unpaid bills when payment actually occurs.
5. Use **Inventory → Stock in** for purchases. Enter quantity in the item's displayed stock unit and cost per that unit. Choose paid now or an unpaid supplier bill. Stock-in updates weighted average cost and creates a linked bill/payment once.
6. Use **Usage** for general supply consumption. Return unused supplies against an original usage; cumulative returns cannot exceed that usage. Consumption and returns do not create another cash payment.
7. Use **Record expense** for incurred business costs. Manage costs and payables in Cashflow → Unpaid bills; paying a bill posts its cash out automatically. Do not enter the same cost again.
8. Use **Transfer** for movement between your own accounts. Use the distinct capital, drawings, loan-principal and asset-purchase actions instead of calling every inflow income or every outflow an expense.
9. Compare physical/bank balances with the ledger using **Count and reconcile**. A count records a variance; it does not silently change cash.
10. Schedule client follow-ups and record call/chat/email outcomes. Contact links open channels; the app does not automatically send messages.

## Reports

- Cash report: opening balances plus posted transactions before the selected period; current-period external cash in/out; closing balances; operating/investing/financing groups; account rollforward; detailed posted/voided source entries and review exceptions. Own-account transfers cancel out in the combined statement.
- Revenue and operating profit: completed service values by event date, direct recorded costs matched to those services, overhead when incurred, actual stock consumption at recorded cost, and stock returns on their movement date. Stock purchases remain assets until consumed. Capital, drawings and loan principal are excluded from operating profit.
- Operating profit is before unrecorded depreciation, financing costs and taxes. Missing closeouts, legacy automatic receipts, unclassified historical entries and unreconciled accounts are flagged. This is a management report, not an independent audit opinion.
- Outstanding balances are a **current** all-date register. They are explicitly not a historical receivables snapshot.
- PDF downloads are generated server-side from the same consistent snapshot as the on-screen figures. CSV retains the transaction detail and source references.

## Deployment

Apply only `database/migrations/018_workflow_audit.sql` to an existing database. It is additive and repeatable; it does not backfill, reset, infer or rewrite historical finances. **Never apply the reset schema to production.** Fresh local databases include this migration in `database/schema.sql`.

Existing records default to `LEGACY` classification and need source-document review. A business owner should reconcile previous automatic booking-completion and consumable-payment postings against bank statements before treating historical profit/cash as final.

Google Calendar uses server-only OAuth credentials, an AES-256-GCM token encryption key, an exact HTTPS production origin/redirect pair, and admin-only connection/consent. Pending/confirmed/done events sync from bookings; completed events stay on Google Calendar. Initial synchronization is explicit in Calendar; subsequent booking creates/updates schedule a background sync. Google is not the financial record of truth.

## Verification

`scripts/verify-workflows.mjs` refuses remote database/origin URLs, creates tagged temporary fixtures, and deletes only those fixtures in its cleanup. Run it against the localhost preview using `QA_DATABASE_URL` and optional `QA_ORIGIN` (default `http://localhost:3100`). It covers concurrent duplicate receipts, overpayment rejection, completion payment gate, stock purchase/consumption/returns, expense settlement, transfers, owner capital/loans, report reconciliation, invalid dates, client follow-ups, protected generic writes and PDF generation.

The report accounting concepts were checked against [IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/) and [IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/). This implementation does not claim complete IFRS or tax compliance.
