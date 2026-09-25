import { requireUser } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVOICE_FROM_EMAIL;
  if (!apiKey || !from) return Response.json({ error: "Invoice email is not configured. Set RESEND_API_KEY and INVOICE_FROM_EMAIL on the local server first." }, { status: 503 });
  let body: { id?: unknown };
  try { body = await request.json() as { id?: unknown }; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return Response.json({ error: "Valid invoice is required." }, { status: 400 });
  try {
    const pool = getLocalPostgresPool();
    const found = await pool.query(`select i.*,c.display_name as client_name,c.email as client_email from public.invoices i join public.clients c on c.id=i.client_id where i.id=$1::uuid`, [body.id]);
    if (!found.rowCount) return Response.json({ error: "Invoice not found." }, { status: 404 });
    const invoice = found.rows[0];
    if (!invoice.client_email) return Response.json({ error: "Add an email address to this client before sending the invoice." }, { status: 400 });
    if (invoice.status === "VOID") return Response.json({ error: "A void invoice cannot be sent." }, { status: 409 });
    const lines = invoice.line_items as Array<{ description: string; quantity: number; unitPrice: number }>;
    const rows = lines.map((line) => `<tr><td style="padding:12px 8px;border-bottom:1px solid #e8e9ed">${escapeHtml(line.description)}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8e9ed">${Number(line.quantity).toLocaleString("en-PH")}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8e9ed">${peso(Number(line.unitPrice))}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8e9ed">${peso(Number(line.quantity) * Number(line.unitPrice))}</td></tr>`).join("");
    const html = `<div style="background:#f5f5f7;padding:32px 12px;font-family:Arial,sans-serif;color:#20212a"><div style="max-width:640px;margin:auto;background:white;border:1px solid #e7e7eb;border-radius:14px;overflow:hidden"><div style="padding:28px 32px;border-bottom:1px solid #ececf0"><div style="font-size:12px;letter-spacing:2px;color:#cf3045;font-weight:bold">SALIKHA STUDIO</div><h1 style="font-size:25px;margin:18px 0 6px">Invoice ${escapeHtml(invoice.invoice_number)}</h1><div style="color:#747681;font-size:13px">Issued ${escapeHtml(invoice.issue_date)}${invoice.due_date ? ` · Due ${escapeHtml(invoice.due_date)}` : ""}</div></div><div style="padding:24px 32px"><p>Hello ${escapeHtml(invoice.client_name)},</p><p>Please find your invoice details below.</p><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#777985;text-align:left"><th style="padding:8px">Description</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Rate</th><th style="padding:8px;text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div style="margin:20px 0 0 auto;max-width:280px;font-size:13px"><div style="display:flex;justify-content:space-between;padding:5px 0"><span>Subtotal</span><strong>${peso(Number(invoice.subtotal))}</strong></div>${Number(invoice.discount_amount) ? `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Discount</span><strong>−${peso(Number(invoice.discount_amount))}</strong></div>` : ""}${Number(invoice.tax_rate) ? `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Tax (${Number(invoice.tax_rate)}%)</span><strong>${peso(Number(invoice.tax_amount))}</strong></div>` : ""}<div style="display:flex;justify-content:space-between;border-top:1px solid #ddd;padding:12px 0;font-size:17px"><strong>Total due</strong><strong>${peso(Number(invoice.total_amount))}</strong></div></div>${invoice.notes ? `<div style="margin-top:18px"><strong>Notes</strong><p style="white-space:pre-line;color:#626571">${escapeHtml(invoice.notes)}</p></div>` : ""}${invoice.terms ? `<div style="margin-top:18px"><strong>Payment terms</strong><p style="white-space:pre-line;color:#626571">${escapeHtml(invoice.terms)}</p></div>` : ""}</div><div style="padding:15px 32px;background:#fafafa;color:#858792;font-size:11px">Thank you for choosing Salikha Studio.</div></div></div>`;
    const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [invoice.client_email], subject: `Invoice ${invoice.invoice_number} · Salikha Studio`, html }) });
    const sendResult = await sent.json() as { id?: string; message?: string; error?: string };
    if (!sent.ok) return Response.json({ error: sendResult.message || sendResult.error || "Email provider rejected the invoice." }, { status: 502 });
    await pool.query("update public.invoices set status=case when status='PAID' then status else 'SENT' end,email_sent_to=$2,sent_at=now(),updated_at=now() where id=$1::uuid", [body.id, invoice.client_email]);
    return Response.json({ ok: true, sentTo: invoice.client_email, providerId: sendResult.id });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice email failed." }, { status: 500 }); }
}
