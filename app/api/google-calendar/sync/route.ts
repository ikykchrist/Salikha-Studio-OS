import { googleCalendarConfigured, syncGoogleCalendar } from "../../../../lib/google-calendar";
import { requireUser } from "../../../../lib/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  if (!googleCalendarConfigured()) return Response.json({ error: "Google Calendar OAuth is not configured." }, { status: 503 });
  try { const result = await syncGoogleCalendar(); return Response.json(result, { status: result.failed.length ? 207 : 200 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Google Calendar sync failed." }, { status: 502 }); }
}
