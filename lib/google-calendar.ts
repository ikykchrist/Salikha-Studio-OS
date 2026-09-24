import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getLocalPostgresPool } from "./local-postgres";

const API = "https://www.googleapis.com/calendar/v3";
const tokenKey = () => {
  const value = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("Set GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY before connecting Google Calendar.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
};
export const googleCalendarConfigured = () => {
  const encodedKey = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || "";
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || "";
  try {
    return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET && Buffer.from(encodedKey, "base64").length === 32 && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/google-calendar\/callback$/.test(redirectUri));
  } catch { return false; }
};
export function encryptGoogleToken(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptGoogleToken(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored Google refresh token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
export async function googleAccessToken() {
  const pool = getLocalPostgresPool();
  const { rows } = await pool.query("select encrypted_refresh_token, access_token, access_token_expires_at from public.google_calendar_connections where id = true");
  const connection = rows[0]; if (!connection) throw new Error("Google Calendar is not connected.");
  if (connection.access_token && connection.access_token_expires_at && new Date(connection.access_token_expires_at).getTime() > Date.now() + 60_000) return connection.access_token as string;
  const form = new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!, client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!, refresh_token: decryptGoogleToken(connection.encrypted_refresh_token), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
  const token = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !token.access_token) throw new Error(token.error_description || "Google access token refresh failed.");
  await pool.query("update public.google_calendar_connections set access_token = $1, access_token_expires_at = now() + ($2::int * interval '1 second'), updated_at = now() where id = true", [token.access_token, token.expires_in || 3600]);
  return token.access_token;
}
export async function googleApi(path: string, init: RequestInit = {}) {
  const token = await googleAccessToken();
  const response = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers }, cache: "no-store" });
  if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; throw new Error(payload?.error?.message || `Google Calendar API returned ${response.status}.`); }
  return response.status === 204 ? null : response.json();
}
export async function syncGoogleCalendar() {
  const pool = getLocalPostgresPool();
  const { rows: connectionRows } = await pool.query("select calendar_id from public.google_calendar_connections where id = true");
  if (!connectionRows[0]) throw new Error("Google Calendar is not connected.");
  const calendarId = encodeURIComponent(connectionRows[0].calendar_id as string);
  const { rows: bookings } = await pool.query(`select b.id, b.event_name, b.event_date::text as event_date, b.start_time::text as start_time, b.end_time::text as end_time, b.venue, b.maps_url, b.status, c.display_name as client_name, p.name as package_name, p.calendar_color, ce.google_event_id
    from public.bookings b left join public.clients c on c.id=b.client_id left join public.service_packages p on p.id=b.package_id left join public.calendar_events ce on ce.booking_id=b.id order by b.event_date`);
  const result = { synced: 0, removed: 0, failed: [] as Array<{ bookingId: string; message: string }> };
  for (const booking of bookings as Array<Record<string, string | null>>) {
    const pending = booking.status === "PENDING";
    try {
      if (!pending) {
        if (booking.google_event_id) await googleApi(`/calendars/${calendarId}/events/${encodeURIComponent(booking.google_event_id)}`, { method: "DELETE" });
        await pool.query(`insert into public.calendar_events (booking_id, google_event_id, calendar_id, sync_status, sync_error, last_synced_at) values ($1::uuid, null, $2, 'REMOVED', null, now()) on conflict (booking_id) do update set google_event_id=null, calendar_id=excluded.calendar_id, sync_status='REMOVED', sync_error=null, last_synced_at=now(), updated_at=now()`, [booking.id, connectionRows[0].calendar_id]);
        if (booking.google_event_id) result.removed++;
        continue;
      }
      if (!booking.event_date || !booking.start_time || !booking.end_time) throw new Error("Event date, start time, and end time are required for Google Calendar sync.");
      const time = (value: string) => value.slice(0, 8).length === 5 ? `${value.slice(0, 5)}:00` : value.slice(0, 8);
      const event = { summary: booking.event_name, location: booking.venue || undefined, description: [`Client: ${booking.client_name || "Unknown client"}`, `Package: ${booking.package_name || "Custom service"}`, booking.maps_url ? `Map: ${booking.maps_url}` : ""].filter(Boolean).join("\n"), start: { dateTime: `${booking.event_date}T${time(booking.start_time!)}`, timeZone: "Asia/Manila" }, end: { dateTime: `${booking.event_date}T${time(booking.end_time!)}`, timeZone: "Asia/Manila" }, extendedProperties: { private: { salikhaBookingId: booking.id! } } };
      const resource = booking.google_event_id
        ? await googleApi(`/calendars/${calendarId}/events/${encodeURIComponent(booking.google_event_id)}`, { method: "PATCH", body: JSON.stringify(event) }) as { id: string }
        : await googleApi(`/calendars/${calendarId}/events`, { method: "POST", body: JSON.stringify(event) }) as { id: string };
      await pool.query(`insert into public.calendar_events (booking_id, google_event_id, calendar_id, sync_status, sync_error, last_synced_at) values ($1::uuid, $2, $3, 'SYNCED', null, now()) on conflict (booking_id) do update set google_event_id=excluded.google_event_id, calendar_id=excluded.calendar_id, sync_status='SYNCED', sync_error=null, last_synced_at=now(), updated_at=now()`, [booking.id, resource.id, connectionRows[0].calendar_id]);
      result.synced++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google event sync failed.";
      await pool.query(`insert into public.calendar_events (booking_id, google_event_id, calendar_id, sync_status, sync_error) values ($1::uuid, $2, $3, 'FAILED', $4) on conflict (booking_id) do update set sync_status='FAILED', sync_error=excluded.sync_error, updated_at=now()`, [booking.id, booking.google_event_id, connectionRows[0].calendar_id, message]).catch(() => undefined);
      result.failed.push({ bookingId: booking.id!, message });
    }
  }
  return result;
}
