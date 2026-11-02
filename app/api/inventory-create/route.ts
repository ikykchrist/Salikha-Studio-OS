import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { requireUser } from "../../../lib/auth";
import { ensureInventoryHistorySchema } from "../../../lib/ensure-inventory-history-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const { name, category, unit, supplier } = body;
  const pcsPerUnit = Number(body.pcsPerUnit);
  const stock = Number(body.openingStock);
  const unitCost = Number(body.unitCost);
  const sellingPrice = Number(body.sellingPrice || 0);
  const reorderLevel = Number(body.reorderLevel || 0);
  if (typeof name !== "string" || !name.trim() || typeof category !== "string" || !category.trim() || typeof unit !== "string" || !unit.trim() || !Number.isFinite(pcsPerUnit) || pcsPerUnit <= 0 || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(sellingPrice) || sellingPrice < 0 || !Number.isFinite(reorderLevel) || reorderLevel < 0) {
    return Response.json({ error: "Provide a name, category, unit, positive pieces-per-unit, and valid non-negative stock and prices." }, { status: 400 });
  }
  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const previous = await client.query("select id, name, unit, is_active from public.inventory_items where name = $1 for update", [name.trim()]);
    if (previous.rowCount && previous.rows[0].is_active) {
      await client.query("rollback");
      return Response.json({ error: "An active inventory item already uses this name. Rename or update that item instead." }, { status: 409 });
    }
    if (previous.rowCount) {
      await ensureInventoryHistorySchema(client);
      const old = previous.rows[0];
      await client.query("update public.inventory_movements set item_name = $2, item_unit = $3 where inventory_item_id = $1::uuid", [old.id, old.name, old.unit]);
      await client.query("delete from public.package_recipes where inventory_item_id = $1::uuid", [old.id]);
      await client.query("delete from public.inventory_items where id = $1::uuid", [old.id]);
    }
    const created = await client.query("insert into public.inventory_items (name, category, unit, pcs_per_unit, selling_price, average_unit_cost, on_hand, reorder_level, supplier) values ($1, $2, $3, $4::numeric(12,3), $5::numeric(12,2), $6::numeric(12,2), $7::numeric(12,3), $8::numeric(12,3), $9) returning id, name, category, unit, pcs_per_unit, selling_price, average_unit_cost, on_hand, reorder_level, supplier", [name.trim(), category.trim(), unit.trim(), pcsPerUnit.toFixed(3), sellingPrice.toFixed(2), unitCost.toFixed(2), stock.toFixed(3), reorderLevel.toFixed(3), typeof supplier === "string" ? supplier.trim() : ""]);
    const item = created.rows[0];
    if (stock > 0) await client.query("insert into public.inventory_movements (inventory_item_id, movement_type, quantity, unit_cost, notes) values ($1::uuid, 'STOCK_IN', $2::numeric(12,3), $3::numeric(12,2), 'Opening stock')", [item.id, stock.toFixed(3), unitCost.toFixed(2)]);
    await client.query("commit");
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Inventory item was not saved." }, { status: 500 });
  } finally { client.release(); }
}
