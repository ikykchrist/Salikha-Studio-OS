import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { uuid } from "../../../lib/workflow-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const bookingId = new URL(request.url).searchParams.get("bookingId");
  if (!uuid(bookingId)) return Response.json({ error: "Choose a valid booking." }, { status: 400 });
  try {
    const db = getLocalPostgresPool();
    const [booking, inventory] = await Promise.all([
      db.query("select coalesce(to_jsonb(b)->'addons_snapshot','[]'::jsonb) as addons from public.bookings b where id=$1::uuid", [bookingId]),
      db.query("select id as \"inventoryItemId\", name as \"itemName\", category, unit, on_hand::text as \"onHand\", average_unit_cost::text as \"unitCost\", pcs_per_unit::text as \"pcsPerUnit\", (average_unit_cost / pcs_per_unit)::text as \"pieceCost\" from public.inventory_items where is_active=true order by name"),
    ]);
    if (!booking.rowCount) return Response.json({ error: "Booking not found." }, { status: 404 });
    return Response.json({ addons: booking.rows[0].addons, inventory: inventory.rows }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Could not load materials for closeout." }, { status: 503 }); }
}
