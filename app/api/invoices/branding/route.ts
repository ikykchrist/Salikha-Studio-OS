import { requireUser } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_IMAGE_BYTES = 1024 * 1024;
const PNG_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || ("logoDataUrl" in body) === ("paymentQrDataUrl" in body)) return Response.json({ error: "Choose one invoice image to update." }, { status: 400 });
  const isQr = "paymentQrDataUrl" in body;
  const field = isQr ? "paymentQrDataUrl" : "logoDataUrl";
  const image = body[field];
  if (image !== null && typeof image !== "string") return Response.json({ error: "Choose a PNG image or remove the existing image." }, { status: 400 });
  if (typeof image === "string") {
    if (!image.startsWith(PNG_PREFIX) || image.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + PNG_PREFIX.length + 4) return Response.json({ error: "Choose a PNG file no larger than 1 MB." }, { status: 413 });
    const encoded = image.slice(PNG_PREFIX.length);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return Response.json({ error: "The PNG file data is invalid." }, { status: 400 });
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length < 33 || bytes.length > MAX_IMAGE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString("ascii", 12, 16) !== "IHDR") return Response.json({ error: "The file is not a valid PNG under 1 MB." }, { status: 400 });
  }
  try {
    const db = getLocalPostgresPool();
    if (isQr) {
      const schema = await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='invoice_settings' and column_name='payment_qr_data_url'");
      if (!schema.rowCount) await db.query("alter table public.invoice_settings add column if not exists payment_qr_data_url text");
    }
    const column = isQr ? "payment_qr_data_url" : "logo_data_url";
    await db.query(`insert into public.invoice_settings(id,${column},updated_at) values(true,$1,now()) on conflict(id) do update set ${column}=excluded.${column},updated_at=now()`, [image]);
    return Response.json({ ok: true, [field]: image });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice branding could not be saved." }, { status: 500 }); }
}
