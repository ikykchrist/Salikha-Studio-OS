import "server-only";
import { calendarOrigin } from "./google-calendar-origin";
import { decryptGoogleToken } from "./google-calendar";
import { getLocalPostgresPool } from "./local-postgres";

export const invoiceEmailRedirectUri = () => `${calendarOrigin()}/api/invoices/email/callback`;
export const invoiceEmailConfigured = () => Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET && process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY);

export async function ensureInvoiceEmailTable() {
  await getLocalPostgresPool().query(`create table if not exists public.invoice_email_connections (
    id boolean primary key default true check (id),
    account_email text not null,
    encrypted_refresh_token text not null,
    access_token text,
    access_token_expires_at timestamptz,
    connected_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getLocalPostgresPool().query("alter table public.invoice_email_connections enable row level security");
}

export async function invoiceEmailConnection() {
  await ensureInvoiceEmailTable();
  const result = await getLocalPostgresPool().query("select account_email, encrypted_refresh_token, access_token, access_token_expires_at from public.invoice_email_connections where id=true");
  return result.rows[0] as { account_email: string; encrypted_refresh_token: string; access_token: string | null; access_token_expires_at: Date | null } | undefined;
}

export async function invoiceEmailAccessToken() {
  const connection = await invoiceEmailConnection();
  if (!connection) throw new Error("Connect the studio Gmail account in Invoices first.");
  if (connection.access_token && connection.access_token_expires_at && new Date(connection.access_token_expires_at).getTime() > Date.now() + 60_000) return { token: connection.access_token, email: connection.account_email };
  const form = new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!, client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!, refresh_token: decryptGoogleToken(connection.encrypted_refresh_token), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Gmail connection expired. Reconnect it in Invoices.");
  await getLocalPostgresPool().query("update public.invoice_email_connections set access_token=$1,access_token_expires_at=now()+($2::int * interval '1 second'),updated_at=now() where id=true", [result.access_token, result.expires_in || 3600]);
  return { token: result.access_token, email: connection.account_email };
}

const cleanHeader = (value: string) => value.replace(/[\r\n]/g, " ").trim();
export function gmailRawInvoice(from: string, to: string, subject: string, html: string, logo?: string | null) {
  const boundary = `salikha_${crypto.randomUUID().replaceAll("-", "")}`;
  const safeFrom = cleanHeader(from);
  const safeTo = cleanHeader(to);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanHeader(subject), "utf8").toString("base64")}?=`;
  const headers = [`From: Salikha Studio <${safeFrom}>`, `To: <${safeTo}>`, `Subject: ${encodedSubject}`, "MIME-Version: 1.0", `Content-Type: multipart/related; boundary="${boundary}"`];
  const parts = [`--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html, "utf8").toString("base64")];
  if (logo) parts.push(`--${boundary}`, "Content-Type: image/png", "Content-Transfer-Encoding: base64", "Content-ID: <salikha-invoice-logo>", "Content-Disposition: inline; filename=salikha-logo.png", "", logo);
  return Buffer.from([...headers, "", ...parts, `--${boundary}--`, ""].join("\r\n"), "utf8").toString("base64url");
}
