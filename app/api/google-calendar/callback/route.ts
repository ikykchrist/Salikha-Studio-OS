import { createHash, timingSafeEqual } from "node:crypto";
import { encryptGoogleToken, googleCalendarConfigured } from "../../../../lib/google-calendar";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  const url = new URL(request.url); const state = url.searchParams.get("state") || ""; const code = url.searchParams.get("code"); const oauthError = url.searchParams.get("error");
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)salikha_google_oauth_state=([^;]+)/)?.[1] || "";
  const clearCookie = "salikha_google_oauth_state=; HttpOnly; SameSite=Lax; Path=/api/google-calendar/callback; Max-Age=0";
  const stateMatch = state.length > 0 && cookie.length > 0 && timingSafeEqual(createHash("sha256").update(state).digest(), createHash("sha256").update(decodeURIComponent(cookie)).digest());
  if (!googleCalendarConfigured() || !stateMatch) return new Response(null, { status: 302, headers: { location: origin + "/?googleCalendar=state-error", "set-cookie": clearCookie } });
  if (oauthError || !code) return new Response(null, { status: 302, headers: { location: origin + "/?googleCalendar=consent-denied", "set-cookie": clearCookie } });
  try {
    const form = new URLSearchParams({ code, client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!, client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!, redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!, grant_type: "authorization_code" });
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
    const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
    if (!tokenResponse.ok || !token.access_token || !token.refresh_token) throw new Error(token.error_description || "Google did not return offline access. Reconnect and approve the requested access.");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: "Bearer " + token.access_token }, cache: "no-store" });
    const profile = await profileResponse.json() as { email?: string };
    if (!profileResponse.ok || !profile.email) throw new Error("Could not identify the connected Google account.");
    const calendarsResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250", { headers: { authorization: "Bearer " + token.access_token }, cache: "no-store" });
    const calendarData = await calendarsResponse.json() as { items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string }> };
    if (!calendarsResponse.ok) throw new Error("Google account connected, but no writable calendars were returned.");
    const calendar = calendarData.items?.find((item) => item.primary && item.accessRole === "owner") || calendarData.items?.find((item) => item.accessRole === "owner" || item.accessRole === "writer");
    if (!calendar) throw new Error("No writable Google Calendar is available for this account.");
    await getLocalPostgresPool().query("insert into public.google_calendar_connections (id, account_email, calendar_id, calendar_name, encrypted_refresh_token, access_token, access_token_expires_at) values (true, $1, $2, $3, $4, $5, now() + ($6::int * interval '1 second')) on conflict (id) do update set account_email=excluded.account_email, calendar_id=excluded.calendar_id, calendar_name=excluded.calendar_name, encrypted_refresh_token=excluded.encrypted_refresh_token, access_token=excluded.access_token, access_token_expires_at=excluded.access_token_expires_at, updated_at=now()", [profile.email, calendar.id, calendar.summary || "Google Calendar", encryptGoogleToken(token.refresh_token), token.access_token, token.expires_in || 3600]);
    return new Response(null, { status: 302, headers: { location: origin + "/?googleCalendar=connected", "set-cookie": clearCookie } });
  } catch (error) {
    return new Response(null, { status: 302, headers: { location: origin + "/?googleCalendar=" + encodeURIComponent(error instanceof Error ? error.message : "Google Calendar connection failed."), "set-cookie": clearCookie } });
  }
}
