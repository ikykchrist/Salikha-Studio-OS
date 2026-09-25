import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const layoutReady = body.layoutReady === true;
  const venueReady = body.venueReady === true;
  const color = typeof body.backdropColor === "string" && body.backdropColor.trim() ? body.backdropColor.trim() : null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: "A valid booking ID is required." }, { status: 400 });
  if (color && (color.length > 80 || /[\u0000-\u001f]/.test(color))) return Response.json({ error: "Backdrop color must be 80 characters or fewer." }, { status: 400 });
  try {
    const result = await getLocalPostgresPool().query(
      `update public.bookings
          set preparation_layout_ready = $2::boolean,
              preparation_venue_ready = $3::boolean,
              preparation_backdrop_color = $4::text,
              updated_at = now()
        where id = $1::uuid and status = 'PENDING'
        returning id, preparation_layout_ready as "layoutReady",
                  preparation_venue_ready as "venueReady",
                  preparation_backdrop_color as "backdropColor"`,
      [id, layoutReady, venueReady, color],
    );
    if (!result.rowCount) return Response.json({ error: "Pending booking not found. Only pending bookings can be prepared." }, { status: 404 });
    const preparation = result.rows[0];
    return Response.json({ preparation, readyForDeployment: preparation.layoutReady && preparation.venueReady && Boolean(preparation.backdropColor) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save preparation checklist." }, { status: 500 }); }
}
