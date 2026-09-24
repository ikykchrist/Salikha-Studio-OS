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
    const found = await client.query("select id, status from public.expenses where id = $1::uuid for update", [input.expenseId]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Expense not found." }, { status: 404 }); }
    if (found.rows[0].status === "PAID") await client.query("update public.cash_transactions set status = 'VOIDED' where reference = $1", [`expense-payment:${input.expenseId}`]);
    await client.query("delete from public.expenses where id = $1::uuid", [input.expenseId]);
    await client.query("commit");
    return Response.json({ deleted: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Expense could not be deleted." }, { status: 500 });
  } finally { client.release(); }
}
