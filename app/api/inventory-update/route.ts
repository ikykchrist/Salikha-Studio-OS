import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { ensureInventoryHistorySchema } from "../../../lib/ensure-inventory-history-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id) ||
      typeof body.name !== "string" || !body.name.trim() ||
      typeof body.category !== "string" || !body.category.trim() ||
      typeof body.unit !== "string" || !body.unit.trim() ||
      !Number.isFinite(Number(body.pcsPerUnit)) || Number(body.pcsPerUnit) <= 0 ||
      !Number.isFinite(Number(body.unitCost)) || Number(body.unitCost) < 0 ||
      !Number.isFinite(Number(body.stock)) || Number(body.stock) < 0 ||
      !Number.isFinite(Number(body.sellingPrice)) || Number(body.sellingPrice) < 0 ||
      !Number.isFinite(Number(body.reorderLevel)) || Number(body.reorderLevel) < 0) {
    return Response.json({ error: "Enter a valid name, category, unit, pieces per unit and prices." }, { status: 400 });
  }
  const db = await getLocalPostgresPool().connect();
  try {
    await db.query("begin");
    const current = await db.query("select id, name, category, unit, pcs_per_unit, selling_price, average_unit_cost, on_hand, reorder_level, supplier from public.inventory_items where id = $1::uuid for update", [body.id]);
    if (!current.rowCount) { await db.query("rollback"); return Response.json({ error: "Inventory item not found." }, { status: 404 }); }
    const before = current.rows[0];
    const stock = Number(body.stock);
    const unitCost = Number(body.unitCost);
    const stockChanged = stock !== Number(before.on_hand);
    const costChanged = unitCost !== Number(before.average_unit_cost);
    const unitChanged = body.unit.trim() !== before.unit;
    const piecesChanged = Number(body.pcsPerUnit) !== Number(before.pcs_per_unit);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if ((stockChanged || costChanged || unitChanged || piecesChanged) && !reason) {
      await db.query("rollback");
      return Response.json({ error: "Enter a reason for stock, cost, unit, or pack-size corrections." }, { status: 400 });
    }
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
    if (unitChanged) {
      await ensureInventoryHistorySchema(db);
      await db.query("update public.inventory_movements set item_name = coalesce(item_name, $2), item_unit = coalesce(item_unit, $3) where inventory_item_id = $1::uuid", [body.id, before.name, before.unit]);
    }
    const result = await db.query("update public.inventory_items set name = $2, category = $3, unit = $4, pcs_per_unit = $5, selling_price = $6, reorder_level = $7, supplier = $8, average_unit_cost = $9, on_hand = $10, updated_at = now() where id = $1::uuid returning id, name, category, unit, pcs_per_unit, selling_price, average_unit_cost, on_hand, reorder_level, supplier", [body.id, body.name.trim(), body.category.trim(), body.unit.trim(), Number(body.pcsPerUnit), Number(body.sellingPrice), Number(body.reorderLevel), String(body.supplier || "").trim(), unitCost, stock]);
    if (stockChanged) {
      await ensureInventoryHistorySchema(db);
      await db.query("insert into public.inventory_movements(inventory_item_id, movement_type, quantity, unit_cost, notes, created_by, item_name, item_unit) values($1::uuid, 'ADJUSTMENT', $2, $3, $4, $5::uuid, $6, $7)", [body.id, Math.abs(stock - Number(before.on_hand)), unitCost, `Admin correction: ${before.on_hand} → ${stock}. ${reason}`, auth.user!.id, before.name, before.unit]);
    }
    await db.query("insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata) values($1::uuid, 'INVENTORY_EDIT', 'inventory_items', $2::uuid, $3::jsonb)", [auth.user!.id, body.id, JSON.stringify({ before, after: result.rows[0], reason })]);
    await db.query("commit");
    return Response.json({ item: result.rows[0] });
  } catch (cause) {
    await db.query("rollback").catch(() => undefined);
    return Response.json({ error: cause instanceof Error ? cause.message : "Inventory item could not be updated." }, { status: 500 });
  } finally { db.release(); }
}
