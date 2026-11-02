import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { ensureInventoryHistorySchema } from "../../../lib/ensure-inventory-history-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id) ||
      typeof body.name !== "string" || !body.name.trim() ||
      typeof body.category !== "string" || !body.category.trim() ||
      typeof body.unit !== "string" || !body.unit.trim() ||
      !Number.isFinite(Number(body.pcsPerUnit)) || Number(body.pcsPerUnit) <= 0 ||
      !Number.isFinite(Number(body.sellingPrice)) || Number(body.sellingPrice) < 0 ||
      !Number.isFinite(Number(body.reorderLevel)) || Number(body.reorderLevel) < 0) {
    return Response.json({ error: "Enter a valid name, category, unit, pieces per unit and prices." }, { status: 400 });
  }
  const db = await getLocalPostgresPool().connect();
  try {
    await db.query("begin");
    const current = await db.query("select id from public.inventory_items where id = $1::uuid for update", [body.id]);
    if (!current.rowCount) { await db.query("rollback"); return Response.json({ error: "Inventory item not found." }, { status: 404 }); }
    const duplicate = await db.query("select id, name, unit, is_active from public.inventory_items where name = $1 and id <> $2::uuid for update", [body.name.trim(), body.id]);
    if (duplicate.rowCount && duplicate.rows[0].is_active) {
      await db.query("rollback");
      return Response.json({ error: "Another active inventory item already uses this name." }, { status: 409 });
    }
    if (duplicate.rowCount) {
      await ensureInventoryHistorySchema(db);
      const old = duplicate.rows[0];
      await db.query("update public.inventory_movements set item_name = $2, item_unit = $3 where inventory_item_id = $1::uuid", [old.id, old.name, old.unit]);
      await db.query("delete from public.package_recipes where inventory_item_id = $1::uuid", [old.id]);
      await db.query("delete from public.inventory_items where id = $1::uuid", [old.id]);
    }
    const result = await db.query("update public.inventory_items set name = $2, category = $3, unit = $4, pcs_per_unit = $5, selling_price = $6, reorder_level = $7, supplier = $8, updated_at = now() where id = $1::uuid returning id, name, category, unit, pcs_per_unit, selling_price, average_unit_cost, on_hand, reorder_level, supplier", [body.id, body.name.trim(), body.category.trim(), body.unit.trim(), Number(body.pcsPerUnit), Number(body.sellingPrice), Number(body.reorderLevel), String(body.supplier || "").trim()]);
    await db.query("commit");
    return Response.json({ item: result.rows[0] });
  } catch (cause) {
    await db.query("rollback").catch(() => undefined);
    return Response.json({ error: cause instanceof Error ? cause.message : "Inventory item could not be updated." }, { status: 500 });
  } finally { db.release(); }
}
