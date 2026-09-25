import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

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

  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const found = await client.query(`select id from public."${table}" where id = $1::uuid for update`, [id]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Record not found." }, { status: 404 }); }

    if (table === "clients") {
      const linked = await client.query("select exists (select 1 from public.bookings where client_id = $1::uuid) as linked", [id]);
      if (linked.rows[0].linked) {
        await client.query("rollback");
        return Response.json({ error: "This client cannot be deleted because booking history is linked to it. Keep the client record or remove the linked bookings first." }, { status: 409 });
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
      const linked = await client.query(`
        select exists (select 1 from public.payments where booking_id = $1::uuid)
          or exists (select 1 from public.expenses where booking_id = $1::uuid)
          or exists (select 1 from public.booking_consumable_usage where booking_id = $1::uuid)
          or exists (select 1 from public.inventory_movements where booking_id = $1::uuid)
          or exists (select 1 from public.calendar_events where booking_id = $1::uuid) as linked
      `, [id]);
      if (linked.rows[0].linked) {
        await client.query("update public.bookings set status = 'ARCHIVED', updated_at = now() where id = $1::uuid", [id]);
        await client.query("commit");
        return Response.json({ action: "archived", message: "This booking has linked financial or operational history, so it was archived instead of deleted." });
      }
    }

    await client.query(`delete from public."${table}" where id = $1::uuid`, [id]);
    await client.query("commit");
    return Response.json({ action: "deleted", message: "Record deleted." });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Record could not be removed." }, { status: 500 });
  } finally { client.release(); }
}
