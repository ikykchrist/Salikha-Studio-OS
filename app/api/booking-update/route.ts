import { getLocalPostgresPool } from "../../../lib/local-postgres";
import type { PoolClient } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moneyPattern = /^\d{1,10}(?:\.\d{1,2})?$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const { id, eventName, date, startTime, endTime, venue, packageName, total, downpaymentAmount, status } = body;
  if (typeof id !== "string" || !uuidPattern.test(id)) return Response.json({ error: "A valid booking ID is required." }, { status: 400 });
  if (typeof eventName !== "string" || !eventName.trim() || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Event name and date are required." }, { status: 400 });
  if (!moneyPattern.test(String(total ?? "")) || !moneyPattern.test(String(downpaymentAmount ?? ""))) return Response.json({ error: "Enter valid total and downpayment amounts." }, { status: 400 });
  const totalValue = Number(total);
  const downpayment = Number(downpaymentAmount);
  if (downpayment > totalValue) return Response.json({ error: "Downpayment cannot exceed the booking total." }, { status: 400 });
  if (status !== "PENDING" && status !== "DONE" && status !== "CANCELLED") return Response.json({ error: "Choose a valid booking status." }, { status: 400 });

  const client: PoolClient = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const currentResult = await client.query("select id from public.bookings where id = $1::uuid for update", [id]);
    if (!currentResult.rowCount) { await client.query("rollback"); return Response.json({ error: "Booking not found." }, { status: 404 }); }
    await client.query(
      `update public.bookings
          set event_name = $2, event_date = $3::date, start_time = nullif($4, '')::time,
              end_time = nullif($5, '')::time, venue = nullif($6, ''),
              total_amount = $7::numeric(12,2), downpayment_amount = $8::numeric(12,2),
              paid_amount = case when $9::public.booking_status = 'DONE' then $7::numeric(12,2) else $8::numeric(12,2) end,
              status = $9::public.booking_status,
              cashflow_posted_at = case when $9::public.booking_status = 'DONE' then now() else null end,
              updated_at = now()
        where id = $1::uuid`,
      [id, eventName.trim(), date, String(startTime || ""), String(endTime || ""), String(venue || ""), totalValue, downpayment, status],
    );

    const downRef = `booking-completion:${id}:downpayment`;
    const balanceRef = `booking-completion:${id}:balance`;
    if (status === "DONE") {
      const accountResult = await client.query(
        "insert into public.cash_accounts (name, opening_balance, is_active) values ('Cash on hand', 0, true) on conflict (name) do update set is_active = true, updated_at = now() returning id",
      );
      const accountId = accountResult.rows[0].id;
      const balance = Math.max(0, Math.round((totalValue - downpayment) * 100) / 100);
      const transactions = [
        { reference: downRef, amount: downpayment, description: `Downpayment received — ${eventName.trim()}` },
        { reference: balanceRef, amount: balance, description: `Booking balance received — ${eventName.trim()}` },
      ];
      for (const transaction of transactions) {
        if (transaction.amount <= 0) {
          await client.query("update public.cash_transactions set status = 'VOIDED' where reference = $1", [transaction.reference]);
          continue;
        }
        const existing = await client.query("select id from public.cash_transactions where reference = $1 limit 1", [transaction.reference]);
        if (existing.rowCount) {
          await client.query("update public.cash_transactions set account_id = $2, transaction_date = $3::date, amount = $4, description = $5, status = 'POSTED' where id = $1", [existing.rows[0].id, accountId, date, transaction.amount, transaction.description]);
        } else {
          await client.query("insert into public.cash_transactions (account_id, transaction_date, type, description, amount, direction, status, reference) values ($1, $2::date, 'Booking payment', $3, $4, 'INFLOW', 'POSTED', $5)", [accountId, date, transaction.description, transaction.amount, transaction.reference]);
        }
      }
    } else {
      await client.query("update public.cash_transactions set status = 'VOIDED' where reference in ($1, $2)", [downRef, balanceRef]);
    }

    const saved = await client.query("select id, total_amount as total, paid_amount as \"paidAmount\", downpayment_amount as \"downpaymentAmount\", status from public.bookings where id = $1::uuid", [id]);
    await client.query("commit");
    return Response.json({ booking: saved.rows[0] });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not save the booking." }, { status: 500 });
  } finally { client.release(); }
}
