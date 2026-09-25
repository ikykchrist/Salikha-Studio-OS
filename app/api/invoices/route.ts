import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export async function GET(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  try {
    const pool = getLocalPostgresPool();
    const [invoiceResult, bookingResult, settingsResult] = await Promise.all([
      pool.query(`select i.*, c.display_name as client_name, c.email as client_email, b.paid_amount as booking_paid, b.event_name, b.event_date, b.start_time, b.end_time, b.venue, p.name as package_name from public.invoices i join public.clients c on c.id=i.client_id left join public.bookings b on b.id=i.booking_id left join public.service_packages p on p.id=b.package_id order by i.created_at desc`),
      pool.query(`select b.id,b.client_id,b.event_name,b.event_date,b.start_time,b.end_time,b.venue,b.total_amount,b.downpayment_amount,b.paid_amount,b.status,c.display_name as client_name,c.email as client_email,p.name as package_name from public.bookings b join public.clients c on c.id=b.client_id left join public.service_packages p on p.id=b.package_id where b.status in ('PENDING','CONFIRMED') and not exists (select 1 from public.invoices i where i.booking_id=b.id and i.status <> 'VOID') order by b.event_date,b.start_time nulls last limit 500`),
      pool.query("select logo_data_url from public.invoice_settings where id=true"),
    ]);
    return Response.json({ invoices: invoiceResult.rows, bookings: bookingResult.rows, logoDataUrl: settingsResult.rows[0]?.logo_data_url ?? null, emailReady: Boolean(process.env.RESEND_API_KEY && process.env.INVOICE_FROM_EMAIL) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoices could not be loaded." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: { bookingId?: unknown; dueDate?: unknown; terms?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.bookingId) || !validDate(body.dueDate)) return Response.json({ error: "Select an active booking and a valid due date." }, { status: 400 });
  const terms = typeof body.terms === "string" ? body.terms.trim().slice(0, 1200) : "Payment is due by the date shown above. Please contact Salikha Studio for payment details.";
  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const booking = await client.query(`select b.id,b.client_id,b.event_name,b.event_date,b.start_time,b.end_time,b.venue,b.total_amount,b.paid_amount,b.discount_amount,c.display_name as client_name,c.email as client_email,p.name as package_name from public.bookings b join public.clients c on c.id=b.client_id left join public.service_packages p on p.id=b.package_id where b.id=$1::uuid and b.status in ('PENDING','CONFIRMED') for update of b`, [body.bookingId]);
    if (!booking.rowCount) { await client.query("rollback"); return Response.json({ error: "That booking is no longer active. Refresh and choose an active booking." }, { status: 409 }); }
    const event = booking.rows[0];
    const duplicate = await client.query("select invoice_number from public.invoices where booking_id=$1::uuid and status <> 'VOID' limit 1", [body.bookingId]);
    if (duplicate.rowCount) { await client.query("rollback"); return Response.json({ error: `This booking already has invoice ${duplicate.rows[0].invoice_number}. Void that invoice before generating another.` }, { status: 409 }); }
    const total = Math.max(0, Number(event.total_amount || 0));
    const lineItems = [{ description: `${event.package_name || "Event photo service"} · ${event.event_name}`, quantity: 1, unitPrice: total }];
    const bookingDetails = { eventName: event.event_name, packageName: event.package_name, eventDate: event.event_date, startTime: event.start_time, endTime: event.end_time, venue: event.venue };
    const created = await client.query(`insert into public.invoices(client_id,booking_id,due_date,status,line_items,booking_details,subtotal,total_amount,terms,created_by) values($1::uuid,$2::uuid,$3::date,'DRAFT',$4::jsonb,$5::jsonb,$6::numeric,$6::numeric,$7,$8::uuid) returning *`, [event.client_id, event.id, body.dueDate, JSON.stringify(lineItems), JSON.stringify(bookingDetails), total, terms, auth.user!.id]);
    await client.query("commit");
    return Response.json({ invoice: { ...created.rows[0], client_name: event.client_name, client_email: event.client_email, booking_paid: event.paid_amount } }, { status: 201 });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return Response.json({ error: "An invoice was just created for this booking. Refresh the invoice list." }, { status: 409 });
    return Response.json({ error: error instanceof Error ? error.message : "Invoice could not be generated." }, { status: 500 });
  } finally { client.release(); }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  let body: { id?: unknown; status?: unknown };
  try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id) || body.status !== "VOID") return Response.json({ error: "Only invoice voiding is supported here." }, { status: 400 });
  try {
    const result = await getLocalPostgresPool().query("update public.invoices set status='VOID',updated_at=now() where id=$1::uuid and status <> 'VOID' returning id,status", [body.id]);
    if (!result.rowCount) return Response.json({ error: "Invoice not found." }, { status: 404 });
    return Response.json({ invoice: result.rows[0] });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invoice could not be updated." }, { status: 500 }); }
}
