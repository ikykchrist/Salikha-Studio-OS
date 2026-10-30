import { randomBytes } from "node:crypto";
import { googleCalendarConfigured } from "../../../../lib/google-calendar";
import { requireUser } from "../../../../lib/auth";
import { calendarOrigin, calendarRedirectUri } from '../../../../lib/google-calendar-origin';

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  let origin: string;
  try { origin = calendarOrigin(); } catch { return Response.json({ error: 'Configure APP_ORIGIN for this deployment.' }, { status: 503 }); }
  if (!googleCalendarConfigured()) return Response.redirect(origin + "/?googleCalendar=configuration-required");
  const redirectUri = calendarRedirectUri();
  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }).toString();
  return new Response(null, { status: 302, headers: { location: url.toString(), "set-cookie": "salikha_google_oauth_state=" + state + "; HttpOnly; SameSite=Lax; Path=/api/google-calendar/callback; Max-Age=600" + (origin.startsWith('https:') ? '; Secure' : '') } });
}
