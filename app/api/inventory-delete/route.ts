import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { ensureInventoryHistorySchema } from "../../../lib/ensure-inventory-history-schema";

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
    await ensureInventoryHistorySchema(client);
    const found = await client.query("select id, name, unit from public.inventory_items where id = $1::uuid for update", [itemId]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Inventory item not found." }, { status: 404 }); }
    const row = found.rows[0];
    await client.query("update public.inventory_movements set item_name = $2, item_unit = $3 where inventory_item_id = $1::uuid", [itemId, row.name, row.unit]);
    await client.query("delete from public.package_recipes where inventory_item_id = $1::uuid", [itemId]);
    await client.query("delete from public.inventory_items where id = $1::uuid", [itemId]);
    await client.query("commit");
    return Response.json({ action: "deleted", message: "Inventory item deleted. Historical movements and booking usage were retained." });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Inventory item could not be removed." }, { status: 500 });
  } finally { client.release(); }
}
