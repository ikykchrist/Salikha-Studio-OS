import { requireUser, verifyPassword } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;

  let body: { action?: unknown; adminPassword?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  if (body.action === "sync-booking-details") {
    try {
      const result = await getLocalPostgresPool().query(`
        update public.invoices i
           set booking_details = jsonb_build_object(
             'eventName', b.event_name,
             'packageName', p.name,
             'eventDate', b.event_date,
             'startTime', b.start_time,
             'endTime', b.end_time,
             'venue', b.venue
           ), updated_at = now()
          from public.bookings b
          left join public.service_packages p on p.id = b.package_id
         where i.booking_id = b.id
         returning i.id
      `);
      return Response.json({ ok: true, updated: result.rowCount ?? 0 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Invoice details could not be refreshed." }, { status: 500 });
    }
  }

  if (body.action !== "delete-void" || typeof body.adminPassword !== "string" || !body.adminPassword || body.adminPassword.length > 256) {
    return Response.json({ error: "Choose a valid maintenance action and enter the administrator password." }, { status: 400 });
  }

  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const admin = await client.query("select password_hash from public.system_users where id = $1::uuid and role = 'ADMIN' and is_active for share", [auth.user!.id]);
    if (!admin.rowCount || !await verifyPassword(body.adminPassword, admin.rows[0].password_hash)) {
      await client.query("rollback");
      return Response.json({ error: "Administrator password is incorrect." }, { status: 401 });
    }
    const deleted = await client.query("delete from public.invoices where status = 'VOID' returning id");
    await client.query("commit");
    return Response.json({ ok: true, deleted: deleted.rowCount ?? 0 });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Void invoices could not be deleted." }, { status: 500 });
  } finally { client.release(); }
}
