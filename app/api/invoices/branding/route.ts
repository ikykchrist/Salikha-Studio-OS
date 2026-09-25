import { requireUser } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_LOGO_BYTES = 1024 * 1024;
const PNG_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: { logoDataUrl?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const logo = body.logoDataUrl;
  if (logo !== null && typeof logo !== "string") return Response.json({ error: "Choose a PNG logo or remove the existing logo." }, { status: 400 });
  if (typeof logo === "string") {
    if (!logo.startsWith(PNG_PREFIX) || logo.length > Math.ceil(MAX_LOGO_BYTES * 4 / 3) + PNG_PREFIX.length + 4) return Response.json({ error: "Logo must be a PNG file no larger than 1 MB." }, { status: 413 });
    const encoded = logo.slice(PNG_PREFIX.length);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return Response.json({ error: "The PNG file data is invalid." }, { status: 400 });
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > MAX_LOGO_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return Response.json({ error: "The file is not a valid PNG under 1 MB." }, { status: 400 });
  }
  try {
    await getLocalPostgresPool().query(`insert into public.invoice_settings(id,logo_data_url,updated_at) values(true,$1,now()) on conflict(id) do update set logo_data_url=excluded.logo_data_url,updated_at=now()`, [logo]);
    return Response.json({ ok: true, logoDataUrl: logo });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice branding could not be saved." }, { status: 500 }); }
}
