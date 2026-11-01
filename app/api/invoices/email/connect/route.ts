import { randomBytes } from "node:crypto";
import { requireUser } from "../../../../../lib/auth";
import { calendarOrigin } from "../../../../../lib/google-calendar-origin";
import { invoiceEmailConfigured, invoiceEmailRedirectUri } from "../../../../../lib/invoice-email";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  if (!invoiceEmailConfigured()) return Response.json({ error: "Google OAuth credentials are not configured." }, { status: 503 });
  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!, redirect_uri: invoiceEmailRedirectUri(), response_type: "code", scope: "openid email https://www.googleapis.com/auth/gmail.send", access_type: "offline", prompt: "consent", state, login_hint: "salikhaprintco@gmail.com" }).toString();
  return new Response(null, { status: 302, headers: { location: url.toString(), "set-cookie": `salikha_invoice_email_state=${state}; HttpOnly; SameSite=Lax; Path=/api/invoices/email/callback; Max-Age=600${calendarOrigin().startsWith("https:") ? "; Secure" : ""}` } });
}
