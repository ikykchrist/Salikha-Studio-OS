import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const { accountId, date, actualBalance, notes } = input;
  if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Number(actualBalance)) || Number(actualBalance) < 0) {
    return Response.json({ error: "Choose an account, date, and non-negative actual balance." }, { status: 400 });
  }
  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const account = await client.query("select opening_balance from public.cash_accounts where id = $1::uuid and is_active for update", [accountId]);
    if (!account.rowCount) { await client.query("rollback"); return Response.json({ error: "Active account not found." }, { status: 404 }); }
    const movement = await client.query("select coalesce(sum(case when direction = 'INFLOW' then amount else -amount end), 0)::numeric(12,2) as amount from public.cash_transactions where account_id = $1::uuid and status = 'POSTED' and transaction_date <= $2::date", [accountId, date]);
    const systemBalance = Number(account.rows[0].opening_balance) + Number(movement.rows[0].amount);
    const actual = Math.round(Number(actualBalance) * 100) / 100;
    const difference = Math.round((actual - systemBalance) * 100) / 100;
    const result = await client.query("insert into public.cash_reconciliations (account_id, reconciled_date, actual_balance, system_balance, difference, notes) values ($1::uuid, $2::date, $3::numeric(12,2), $4::numeric(12,2), $5::numeric(12,2), nullif($6, '')) returning id, reconciled_date, actual_balance, system_balance, difference", [accountId, date, actual.toFixed(2), systemBalance.toFixed(2), difference.toFixed(2), typeof notes === "string" ? notes.trim() : ""]);
    await client.query("commit");
    return Response.json({ reconciliation: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Reconciliation failed." }, { status: 500 });
  } finally { client.release(); }
}
