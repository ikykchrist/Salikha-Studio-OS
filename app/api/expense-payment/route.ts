import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (typeof input.expenseId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.expenseId)) return Response.json({ error: "A valid expense ID is required." }, { status: 400 });
  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const found = await client.query("select id, description, amount, expense_date, account, status from public.expenses where id = $1::uuid for update", [input.expenseId]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Expense not found." }, { status: 404 }); }
    const expense = found.rows[0];
    if (expense.status === "PAID") { await client.query("commit"); return Response.json({ status: "PAID", alreadyPaid: true }); }
    const account = await client.query("select id from public.cash_accounts where name = $1 and is_active limit 1", [expense.account]);
    if (!account.rowCount) { await client.query("rollback"); return Response.json({ error: `Cash account “${expense.account}” is not active. Choose an existing active cash account.` }, { status: 409 }); }
    const reference = `expense-payment:${expense.id}`;
    await client.query("insert into public.cash_transactions (account_id, transaction_date, type, description, amount, direction, status, reference) values ($1::uuid, $2::date, 'Expense payment', $3, $4::numeric(12,2), 'OUTFLOW', 'POSTED', $5) on conflict do nothing", [account.rows[0].id, expense.expense_date, `Paid expense — ${expense.description}`, String(expense.amount), reference]);
    await client.query("update public.expenses set status = 'PAID', updated_at = now() where id = $1::uuid", [expense.id]);
    await client.query("commit");
    return Response.json({ status: "PAID" });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not post expense payment." }, { status: 500 });
  } finally { client.release(); }
}
