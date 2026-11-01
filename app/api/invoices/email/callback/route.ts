import { createHash, timingSafeEqual } from "node:crypto";
import { requireUser } from "../../../../../lib/auth";
import { encryptGoogleToken } from "../../../../../lib/google-calendar";
import { calendarOrigin } from "../../../../../lib/google-calendar-origin";
import { ensureInvoiceEmailTable, invoiceEmailRedirectUri } from "../../../../../lib/invoice-email";
import { getLocalPostgresPool } from "../../../../../lib/local-postgres";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  const origin = calendarOrigin();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code");
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)salikha_invoice_email_state=([^;]+)/)?.[1] || "";
  const clear = `salikha_invoice_email_state=; HttpOnly; SameSite=Lax; Path=/api/invoices/email/callback; Max-Age=0${origin.startsWith("https:") ? "; Secure" : ""}`;
  const redirect = (status: string) => new Response(null, { status: 302, headers: { location: `${origin}/?invoiceEmail=${encodeURIComponent(status)}`, "set-cookie": clear } });
  const validState = Boolean(state && cookie) && timingSafeEqual(createHash("sha256").update(state).digest(), createHash("sha256").update(cookie).digest());
  if (!validState) return redirect("state-error");
  if (!code || url.searchParams.has("error")) return redirect("consent-denied");
  try {
    const form = new URLSearchParams({ code, client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!, client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!, redirect_uri: invoiceEmailRedirectUri(), grant_type: "authorization_code" });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
    const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
    if (!response.ok || !token.access_token || !token.refresh_token || !token.scope?.includes("https://www.googleapis.com/auth/gmail.send")) throw new Error(token.error_description || "Gmail send permission was not granted. Reconnect and approve email sending.");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const profile = await profileResponse.json() as { email?: string };
    if (!profileResponse.ok || profile.email?.toLowerCase() !== "salikhaprintco@gmail.com") throw new Error("Select salikhaprintco@gmail.com as the sender account.");
    await ensureInvoiceEmailTable();
    await getLocalPostgresPool().query("insert into public.invoice_email_connections (id,account_email,encrypted_refresh_token,access_token,access_token_expires_at) values(true,$1,$2,$3,now()+($4::int * interval '1 second')) on conflict(id) do update set account_email=excluded.account_email,encrypted_refresh_token=excluded.encrypted_refresh_token,access_token=excluded.access_token,access_token_expires_at=excluded.access_token_expires_at,updated_at=now()", [profile.email, encryptGoogleToken(token.refresh_token), token.access_token, token.expires_in || 3600]);
    return redirect("connected");
  } catch (error) { return redirect(error instanceof Error ? error.message : "Gmail connection failed."); }
}
