import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const reconciliations = await client.query("delete from public.cash_reconciliations");
    const transactions = await client.query("delete from public.cash_transactions");
    await client.query("commit");
    return Response.json({ cleared: true, reconciliations: reconciliations.rowCount ?? 0, transactions: transactions.rowCount ?? 0 });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Cashflow records could not be cleared." }, { status: 500 });
  } finally { client.release(); }
}
