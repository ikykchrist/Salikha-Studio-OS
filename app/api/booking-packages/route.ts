import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  try {
    const result = await getLocalPostgresPool().query("select id, name, base_price, duration, inclusions, is_active from public.service_packages order by is_active desc, name");
    return Response.json({ packages: result.rows });
  } catch {
    return Response.json({ error: "Could not load the current package catalog." }, { status: 503 });
  }
}
