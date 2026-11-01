import { requireUser } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";
import { formatManilaDate, formatManilaTime } from "../../../../lib/manila-datetime";
import { gmailRawInvoice, invoiceEmailAccessToken } from "../../../../lib/invoice-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: { id?: unknown; resend?: unknown };
  try { body = await request.json() as { id?: unknown; resend?: unknown }; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return Response.json({ error: "Valid invoice is required." }, { status: 400 });
  try {
    const pool = getLocalPostgresPool();
    const sender = await invoiceEmailAccessToken();
    const client = await pool.connect();
    try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [body.id]);
    const found = await client.query(`select i.*,c.display_name as client_name,c.email as client_email,b.paid_amount as booking_paid,b.event_name,b.event_date,b.start_time,b.end_time,b.venue,p.name as package_name,s.logo_data_url from public.invoices i join public.clients c on c.id=i.client_id left join public.bookings b on b.id=i.booking_id left join public.service_packages p on p.id=b.package_id cross join lateral (select logo_data_url from public.invoice_settings where id=true union all select null::text where not exists(select 1 from public.invoice_settings where id=true) limit 1) s where i.id=$1::uuid`, [body.id]);
    if (!found.rowCount) return Response.json({ error: "Invoice not found." }, { status: 404 });
    const invoice = found.rows[0];
    if (!invoice.client_email) return Response.json({ error: "Add an email address to this client before sending the invoice." }, { status: 400 });
    if (invoice.status === "VOID") return Response.json({ error: "A void invoice cannot be sent." }, { status: 409 });
    if (invoice.sent_at && body.resend !== true) return Response.json({ error: "This invoice was already sent. Confirm a resend in the Invoice tab if needed." }, { status: 409 });
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(invoice.client_email)) return Response.json({ error: "The client email address is invalid." }, { status: 400 });
    const lines = invoice.line_items as Array<{ description: string; quantity: number; unitPrice: number }>;
    const bookingSnapshot = (invoice.booking_details || {}) as { eventName?: string; packageName?: string; eventDate?: string; startTime?: string; endTime?: string; venue?: string };
    const booking = { eventName: invoice.event_name || bookingSnapshot.eventName, packageName: invoice.package_name || bookingSnapshot.packageName, eventDate: invoice.event_date || bookingSnapshot.eventDate, startTime: invoice.start_time || bookingSnapshot.startTime, endTime: invoice.end_time || bookingSnapshot.endTime, venue: invoice.venue || bookingSnapshot.venue };
    const eventDate = formatManilaDate(booking.eventDate, { month: "long", day: "numeric", year: "numeric" });
    const clock = formatManilaTime;
    const paid = Math.min(Number(invoice.total_amount), Number(invoice.booking_paid || 0));
    const balance = Math.max(0, Number(invoice.total_amount) - paid);
    const logo = typeof invoice.logo_data_url === "string" && invoice.logo_data_url.startsWith("data:image/png;base64,") ? invoice.logo_data_url.slice("data:image/png;base64,".length) : null;
    const rows = lines.map((line) => `<tr><td style="padding:12px 8px;border-bottom:1px solid #e8e9ed">${escapeHtml(line.description)}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8e9ed">${Number(line.quantity).toLocaleString("en-PH")}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8e9ed">${peso(Number(line.unitPrice))}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8e9ed">${peso(Number(line.quantity) * Number(line.unitPrice))}</td></tr>`).join("");
    const eventDetails = `<div style="background:#f7f7f9;border-radius:8px;padding:14px;margin:18px 0;font-size:13px"><strong>${escapeHtml(booking.eventName || invoice.event_name || "Event booking")}</strong><div style="color:#676975;margin-top:6px">${escapeHtml(booking.packageName || "Event photo service")} · ${escapeHtml(eventDate)} · ${escapeHtml(clock(booking.startTime))}–${escapeHtml(clock(booking.endTime))}</div><div style="color:#676975;margin-top:4px">Venue: ${escapeHtml(booking.venue || "Not specified")}</div></div>`;
    const html = `<div style="background:#f5f5f7;padding:32px 12px;font-family:Arial,sans-serif;color:#20212a"><div style="max-width:640px;margin:auto;background:white;border:1px solid #e7e7eb;border-radius:14px;overflow:hidden"><div style="padding:28px 32px;border-bottom:1px solid #ececf0"><div style="display:flex;align-items:center;gap:12px">${logo ? `<img src="cid:salikha-invoice-logo" alt="Salikha Studio" style="max-width:160px;max-height:56px;object-fit:contain">` : `<span style="font-size:12px;letter-spacing:2px;color:#cf3045;font-weight:bold">SALIKHA STUDIO</span>`}</div><h1 style="font-size:25px;margin:18px 0 6px">Invoice ${escapeHtml(invoice.invoice_number)}</h1><div style="color:#747681;font-size:13px">Issued ${escapeHtml(invoice.issue_date)}${invoice.due_date ? ` · Due ${escapeHtml(invoice.due_date)}` : ""}</div></div><div style="padding:24px 32px"><p>Hello ${escapeHtml(invoice.client_name)},</p><p>Please find your invoice details below.</p>${eventDetails}<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#777985;text-align:left"><th style="padding:8px">Description</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Rate</th><th style="padding:8px;text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div style="margin:20px 0 0 auto;max-width:280px;font-size:13px"><div style="display:flex;justify-content:space-between;padding:5px 0"><span>Booking total</span><strong>${peso(Number(invoice.total_amount))}</strong></div>${paid > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Paid to date</span><strong>−${peso(paid)}</strong></div>` : ""}<div style="display:flex;justify-content:space-between;border-top:1px solid #ddd;padding:12px 0;font-size:17px"><strong>Balance due</strong><strong>${peso(balance)}</strong></div></div>${invoice.terms ? `<div style="margin-top:18px"><strong>Payment terms</strong><p style="white-space:pre-line;color:#626571">${escapeHtml(invoice.terms)}</p></div>` : ""}</div><div style="padding:15px 32px;background:#fafafa;color:#858792;font-size:11px">Thank you for choosing Salikha Studio.</div></div></div>`;
    const raw = gmailRawInvoice(sender.email, invoice.client_email, `Invoice ${invoice.invoice_number} · Salikha Studio`, html, logo);
    const sent = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: `Bearer ${sender.token}`, "content-type": "application/json" }, body: JSON.stringify({ raw }), cache: "no-store" });
    const sendResult = await sent.json() as { id?: string; error?: { message?: string } };
    if (!sent.ok || !sendResult.id) { await client.query("rollback"); return Response.json({ error: sendResult.error?.message || "Gmail rejected the invoice. Reconnect the studio email if its permission expired." }, { status: 502 }); }
    await client.query("update public.invoices set status=case when status='PAID' then status else 'SENT' end,email_sent_to=$2,sent_at=now(),updated_at=now() where id=$1::uuid", [body.id, invoice.client_email]);
    await client.query("commit");
    return Response.json({ ok: true, sentTo: invoice.client_email, providerId: sendResult.id });
    } finally { await client.query("rollback").catch(() => undefined); client.release(); }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice email failed." }, { status: 500 }); }
}
