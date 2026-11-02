import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { uuid } from "../../../lib/workflow-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId");
  const packageId = url.searchParams.get("packageId");
  if (!uuid(bookingId) || packageId && !uuid(packageId)) return Response.json({ error: "Choose a valid booking and package." }, { status: 400 });
  try {
    const db = getLocalPostgresPool();
    const [booking, addons] = await Promise.all([
      db.query("select package_id, transport_amount, addons_amount, coalesce(to_jsonb(b)->'addons_snapshot','[]'::jsonb) as addons_snapshot from public.bookings b where id=$1::uuid", [bookingId]),
      packageId ? db.query("select id, name, price from public.package_addons where package_id=$1::uuid and is_active=true order by name", [packageId]) : Promise.resolve({ rows: [] }),
    ]);
    if (!booking.rowCount) return Response.json({ error: "Booking not found." }, { status: 404 });
    return Response.json({ addons: addons.rows, saved: booking.rows[0].addons_snapshot, savedPackageId: booking.rows[0].package_id, transportAmount: Number(booking.rows[0].transport_amount), addonsAmount: Number(booking.rows[0].addons_amount) }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Could not load booking add-ons." }, { status: 503 }); }
}
