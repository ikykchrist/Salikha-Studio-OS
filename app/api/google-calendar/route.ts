import { googleApi, googleCalendarConfigured } from "../../../lib/google-calendar";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireUser(request); if (auth.response) return auth.response;
  try {
    const pool = getLocalPostgresPool();
    const { rows } = await pool.query("select account_email, calendar_id, calendar_name, connected_at from public.google_calendar_connections where id = true");
    const sync = rows[0] ? await pool.query("select count(*) filter (where sync_status='FAILED' and b.status='PENDING')::int as failed_count, max(ce.last_synced_at) as last_synced_at, (array_agg(ce.sync_error order by ce.updated_at desc) filter (where ce.sync_status='FAILED' and b.status='PENDING'))[1] as last_error from public.calendar_events ce join public.bookings b on b.id=ce.booking_id") : null;
    return Response.json({ configured: googleCalendarConfigured(), connected: Boolean(rows[0]), connection: rows[0] || null, sync: sync?.rows[0] || null });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not check Google Calendar connection." }, { status: 503 }); }
}
export async function POST(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  let body: { calendarId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Valid JSON is required." }, { status: 400 }); }
  if (typeof body.calendarId !== "string" || !body.calendarId.trim()) return Response.json({ error: "Choose a calendar." }, { status: 400 });
  try {
    const calendars = await googleApi("/users/me/calendarList?minAccessRole=writer&maxResults=250") as { items?: Array<{ id: string; summary?: string; accessRole?: string }> };
    const chosen = calendars.items?.find((item) => item.id === body.calendarId && (item.accessRole === "writer" || item.accessRole === "owner"));
    if (!chosen) return Response.json({ error: "Calendar not found or is not writable by the connected account." }, { status: 403 });
    await getLocalPostgresPool().query("update public.google_calendar_connections set calendar_id=$1, calendar_name=$2, updated_at=now() where id=true", [chosen.id, chosen.summary || "Google Calendar"]);
    return Response.json({ calendarId: chosen.id, calendarName: chosen.summary || "Google Calendar" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not select calendar." }, { status: 502 }); }
}
