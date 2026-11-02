import { requireUser, verifyPassword } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { googleAccessToken } from "../../../lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTables = new Set(["clients", "bookings", "service_packages", "cash_accounts", "equipment", "package_addons", "package_recipes"]);

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const table = input.table;
  const id = input.id;
  if (typeof table !== "string" || !allowedTables.has(table) || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "A valid record and table are required." }, { status: 400 });
  }

  // The production pool has one connection. Resolve OAuth before opening the
  // deletion transaction so a token refresh cannot wait on our own lock.
  let calendarToken = "";
  let calendarTokenError = "";
  if (table === "bookings") {
    try { calendarToken = await googleAccessToken(); }
    catch (error) { calendarTokenError = error instanceof Error ? error.message : "Google Calendar is unavailable."; }
  }
  const client = await getLocalPostgresPool().connect();
  let calendarEventToDelete: { google_event_id: string; calendar_id: string | null } | undefined;
  try {
    await client.query("begin");
    const found = await client.query(`select id from public."${table}" where id = $1::uuid for update`, [id]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Record not found." }, { status: 404 }); }

    if (table === "clients") {
      const linked = await client.query("select exists (select 1 from public.bookings where client_id = $1::uuid) or exists (select 1 from public.invoices where client_id = $1::uuid) as linked", [id]);
      if (linked.rows[0].linked) {
        await client.query("rollback");
        return Response.json({ error: "This client cannot be deleted because booking or invoice history is linked to it. Keep the client record or resolve the linked records first." }, { status: 409 });
      }
    }

    if (table === "service_packages") {
      const linked = await client.query("select exists (select 1 from public.bookings where package_id = $1::uuid) as linked", [id]);
      if (linked.rows[0].linked) {
        await client.query("update public.service_packages set is_active = false, updated_at = now() where id = $1::uuid", [id]);
        await client.query("commit");
        return Response.json({ action: "archived", message: "This package has booking history, so it was archived instead of deleted." });
      }
    }

    if (table === "cash_accounts") {
      const linked = await client.query(`
        select exists (select 1 from public.cash_transactions where account_id = $1::uuid)
          or exists (select 1 from public.cash_reconciliations where account_id = $1::uuid) as linked
      `, [id]);
      if (linked.rows[0].linked) {
        await client.query("update public.cash_accounts set is_active = false, updated_at = now() where id = $1::uuid", [id]);
        await client.query("commit");
        return Response.json({ action: "archived", message: "This account has transaction history, so it was archived instead of deleted." });
      }
    }

    if (table === "bookings") {
      const financialHistory = await client.query(`select exists(select 1 from public.cash_transactions where booking_id=$1 or reference like '%' || $1::text || '%') or exists(select 1 from public.payments where booking_id=$1) or exists(select 1 from public.inventory_movements where booking_id=$1) or exists(select 1 from public.expenses where booking_id=$1) as linked`,[id]);
      if (financialHistory.rows[0].linked) { await client.query('rollback'); return Response.json({error:'This booking has financial or stock history. Keep it in the archive; linked audit records cannot be permanently removed.'},{status:409}); }
      const linked = await client.query(`
        select
          (select count(*)::int from public.payments where booking_id = $1::uuid) as payments,
          (select count(*)::int from public.expenses where booking_id = $1::uuid) as expenses,
          (select count(*)::int from public.booking_consumable_usage where booking_id = $1::uuid) as usage,
          (select count(*)::int from public.inventory_movements where booking_id = $1::uuid) as movements,
          (select count(*)::int from public.calendar_events where booking_id = $1::uuid) as calendar_events
      `, [id]);
      const history = linked.rows[0] as { payments: number; expenses: number; usage: number; movements: number; calendar_events: number };
      const hasHistory = Object.values(history).some((count) => count > 0);
      if (hasHistory && auth.user!.role !== "ADMIN") {
        await client.query("update public.bookings set status = 'ARCHIVED', updated_at = now() where id = $1::uuid", [id]);
        await client.query("commit");
        return Response.json({ action: "archived", message: "Booking with linked records requires an administrator to permanently delete." });
      }
      if (hasHistory) {
        const password = typeof input.adminPassword === "string" ? input.adminPassword : "";
        if (!password || password.length > 256) {
          await client.query("rollback");
          return Response.json({ error: "This booking has linked records. Enter your administrator password to permanently remove them.", overrideRequired: true, linkedRecords: history }, { status: 409 });
        }
        const admin = await client.query("select password_hash from public.system_users where id = $1::uuid and role = 'ADMIN' and is_active for share", [auth.user!.id]);
        if (!admin.rowCount || !await verifyPassword(password, admin.rows[0].password_hash)) {
          await client.query("rollback");
          return Response.json({ error: "Administrator password is incorrect.", overrideRequired: true }, { status: 401 });
        }

        const linkedExpenses = await client.query("select id from public.expenses where booking_id = $1::uuid", [id]);
        const calendarResult = await client.query("select google_event_id, calendar_id from public.calendar_events where booking_id = $1::uuid and google_event_id is not null limit 1", [id]);
        calendarEventToDelete = calendarResult.rows[0] as { google_event_id: string; calendar_id: string | null } | undefined;
        const expenseIds = linkedExpenses.rows.map((row: { id: string }) => row.id);
        const generatedReferences = [
          `booking-completion:${id}:downpayment`,
          `booking-completion:${id}:balance`,
          ...expenseIds.flatMap((expenseId: string) => [`booking-expense:${expenseId}`, `expense-payment:${expenseId}`]),
        ];
        await client.query("delete from public.cash_transactions where reference = any($1::text[])", [generatedReferences]);
        await client.query(`
          update public.inventory_items item
             set on_hand = item.on_hand + usage.used_quantity, updated_at = now()
            from (select inventory_item_id, sum(quantity) as used_quantity from public.inventory_movements where booking_id = $1::uuid and movement_type = 'USAGE' and inventory_item_id is not null group by inventory_item_id) usage
           where item.id = usage.inventory_item_id
        `, [id]);
        await client.query("delete from public.expenses where booking_id = $1::uuid", [id]);
        await client.query("delete from public.payments where booking_id = $1::uuid", [id]);
        await client.query("delete from public.inventory_movements where booking_id = $1::uuid", [id]);
        await client.query("delete from public.booking_consumable_usage where booking_id = $1::uuid", [id]);
        await client.query("delete from public.calendar_events where booking_id = $1::uuid", [id]);
      }
      // Keep the original Telegram intake for audit while removing its reference
      // to a booking that the administrator has chosen to delete.
      await client.query("update public.telegram_booking_drafts set booking_id = null, updated_at = now() where booking_id = $1::uuid", [id]);
      if (calendarEventToDelete) {
        if (!calendarToken || !calendarEventToDelete.calendar_id) {
          await client.query("rollback");
          return Response.json({ error: `Booking was kept because its Google Calendar event could not be removed. ${calendarTokenError || "Reconnect Google Calendar and retry."}` }, { status: 503 });
        }
        const calendarResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEventToDelete.calendar_id)}/events/${encodeURIComponent(calendarEventToDelete.google_event_id)}`, {
          method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(12000),
          headers: { authorization: `Bearer ${calendarToken}` },
        });
        // Google reports an already removed event as 404 or 410.
        if (!calendarResponse.ok && calendarResponse.status !== 404 && calendarResponse.status !== 410) {
          await client.query("rollback");
          return Response.json({ error: `Booking was kept because Google Calendar could not remove the event (HTTP ${calendarResponse.status}). Retry the deletion.` }, { status: 502 });
        }
      }
    }

    await client.query(`delete from public."${table}" where id = $1::uuid`, [id]);
    await client.query("commit");
    return Response.json({ action: "deleted", message: table === "bookings" ? (calendarEventToDelete ? "Booking and its Google Calendar event were deleted." : "Booking deleted.") : "Record deleted." });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Record could not be removed." }, { status: 500 });
  } finally { client.release(); }
}
