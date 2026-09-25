import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const itemId = input.inventoryItemId;
  if (typeof itemId !== "string" || !/^[0-9a-f-]{36}$/i.test(itemId)) return Response.json({ error: "A valid inventory item ID is required." }, { status: 400 });

  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const found = await client.query(`
      select id,
        exists (select 1 from public.inventory_movements where inventory_item_id = i.id) as has_movements,
        exists (select 1 from public.package_recipes where inventory_item_id = i.id) as has_recipes,
        exists (select 1 from public.booking_consumable_usage where inventory_item_id = i.id) as has_usage
      from public.inventory_items i where i.id = $1::uuid for update
    `, [itemId]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Inventory item not found." }, { status: 404 }); }
    const row = found.rows[0];
    if (row.has_movements || row.has_recipes || row.has_usage) {
      await client.query("update public.inventory_items set is_active = false, updated_at = now() where id = $1::uuid", [itemId]);
      await client.query("commit");
      return Response.json({ action: "archived" });
    }
    await client.query("delete from public.inventory_items where id = $1::uuid", [itemId]);
    await client.query("commit");
    return Response.json({ action: "deleted" });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Inventory item could not be removed." }, { status: 500 });
  } finally { client.release(); }
}
