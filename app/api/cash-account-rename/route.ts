import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const result = await getLocalPostgresPool().query("update public.cash_accounts set name = 'MariBank', updated_at = now() where name = 'Bank account' returning id, name");
  return Response.json({ renamed: result.rowCount ?? 0, account: result.rows[0] ?? null });
}
