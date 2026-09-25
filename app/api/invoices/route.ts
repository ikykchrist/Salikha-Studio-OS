import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceLine = { description: string; quantity: number; unitPrice: number };
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function parseLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new Error("Add between 1 and 50 invoice items.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid invoice item.");
    const line = entry as Record<string, unknown>;
    const description = typeof line.description === "string" ? line.description.trim().slice(0, 180) : "";
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000_000) throw new Error("Each item needs a description, positive quantity, and non-negative price.");
    return { description, quantity, unitPrice: money(unitPrice) };
  });
}

export async function GET(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  try {
    const pool = getLocalPostgresPool();
    const [invoiceResult, clientResult, bookingResult] = await Promise.all([
      pool.query(`select i.*, c.display_name as client_name, c.email as client_email, b.event_name, b.event_date, b.paid_amount as booking_paid from public.invoices i join public.clients c on c.id=i.client_id left join public.bookings b on b.id=i.booking_id order by i.created_at desc`),
      pool.query("select id, display_name, email from public.clients order by display_name"),
      pool.query("select b.id,b.client_id,b.event_name,b.event_date,b.total_amount,b.downpayment_amount,b.paid_amount,p.name as package_name from public.bookings b left join public.service_packages p on p.id=b.package_id where b.status not in ('CANCELLED','ARCHIVED') order by b.event_date desc limit 500"),
    ]);
    return Response.json({ invoices: invoiceResult.rows, clients: clientResult.rows, bookings: bookingResult.rows, emailReady: Boolean(process.env.RESEND_API_KEY && process.env.INVOICE_FROM_EMAIL) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invoices could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  const issueDate = typeof body.issueDate === "string" ? body.issueDate : "";
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;
  let lines: InvoiceLine[];
  try { lines = parseLines(body.lineItems); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid items." }, { status: 400 }); }
  const discount = Number(body.discountAmount ?? 0);
  const taxRate = Number(body.taxRate ?? 0);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if ((id && !/^[0-9a-f-]{36}$/i.test(id)) || !/^[0-9a-f-]{36}$/i.test(clientId) || (bookingId && !/^[0-9a-f-]{36}$/i.test(bookingId)) || !validDate(issueDate) || (dueDate && !validDate(dueDate)) || !Number.isFinite(discount) || discount < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return Response.json({ error: "Enter a valid client, issue/due date, discount, and tax rate." }, { status: 400 });
  const subtotal = money(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  if (discount > subtotal) return Response.json({ error: "Discount cannot exceed the subtotal." }, { status: 400 });
  const taxAmount = money((subtotal - discount) * taxRate / 100);
  const total = money(subtotal - discount + taxAmount);
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
  const terms = typeof body.terms === "string" ? body.terms.trim().slice(0, 2000) : "";
  try {
    const pool = getLocalPostgresPool();
    if (bookingId) {
      const linked = await pool.query("select client_id from public.bookings where id=$1::uuid", [bookingId]);
      if (!linked.rowCount || linked.rows[0].client_id !== clientId) return Response.json({ error: "The selected booking does not belong to this client." }, { status: 400 });
      const existing = await pool.query("select invoice_number from public.invoices where booking_id=$1::uuid and status <> 'VOID' and ($2::uuid is null or id <> $2::uuid) limit 1", [bookingId, id || null]);
      if (existing.rowCount) return Response.json({ error: `Booking already has active invoice ${existing.rows[0].invoice_number}. Void it before creating another.` }, { status: 409 });
    }
    let result;
    if (id) {
      result = await pool.query(`update public.invoices set client_id=$2::uuid,booking_id=$3::uuid,issue_date=$4::date,due_date=$5::date,line_items=$6::jsonb,subtotal=$7::numeric,discount_amount=$8::numeric,tax_rate=$9::numeric,tax_amount=$10::numeric,total_amount=$11::numeric,notes=$12,terms=$13,updated_at=now() where id=$1::uuid and status='DRAFT' returning *`, [id, clientId, bookingId, issueDate, dueDate, JSON.stringify(lines), subtotal, money(discount), taxRate, taxAmount, total, notes || null, terms || null]);
      if (!result.rowCount) return Response.json({ error: "Draft invoice not found or no longer editable." }, { status: 404 });
    } else {
      result = await pool.query(`insert into public.invoices(client_id,booking_id,issue_date,due_date,line_items,subtotal,discount_amount,tax_rate,tax_amount,total_amount,notes,terms,created_by) values($1::uuid,$2::uuid,$3::date,$4::date,$5::jsonb,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,$11,$12,$13::uuid) returning *`, [clientId, bookingId, issueDate, dueDate, JSON.stringify(lines), subtotal, money(discount), taxRate, taxAmount, total, notes || null, terms || null, auth.user!.id]);
    }
    return Response.json({ invoice: result.rows[0] }, { status: id ? 200 : 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice could not be saved." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  const status = body.status;
  if (!/^[0-9a-f-]{36}$/i.test(id) || status !== "VOID") return Response.json({ error: "Only invoice voiding is supported here. Record payment through the booking workflow." }, { status: 400 });
  try {
    const result = await getLocalPostgresPool().query("update public.invoices set status=$2,updated_at=now() where id=$1::uuid and status <> 'VOID' returning id,status", [id, status]);
    if (!result.rowCount) return Response.json({ error: "Invoice not found." }, { status: 404 });
    return Response.json({ invoice: result.rows[0] });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice could not be updated." }, { status: 500 }); }
}
