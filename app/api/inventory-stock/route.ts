import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const itemId = input.itemId;
  const quantity = Number(input.quantity);
  const type = input.type;
  if (typeof itemId !== "string" || !/^[0-9a-f-]{36}$/i.test(itemId) || !Number.isFinite(quantity) || quantity <= 0 || !["STOCK_IN", "USAGE", "RETURN", "ADJUSTMENT"].includes(String(type))) {
    return Response.json({ error: "Choose a valid item, movement type, and positive quantity." }, { status: 400 });
  }
  const delta = type === "STOCK_IN" || type === "RETURN" ? quantity : -quantity;
  const client = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const found = await client.query("select on_hand, average_unit_cost from public.inventory_items where id = $1::uuid and is_active for update", [itemId]);
    if (!found.rowCount) { await client.query("rollback"); return Response.json({ error: "Active inventory item not found." }, { status: 404 }); }
    const nextStock = Number(found.rows[0].on_hand) + delta;
    if (nextStock < 0) { await client.query("rollback"); return Response.json({ error: "Not enough stock for this movement." }, { status: 409 }); }
    await client.query("update public.inventory_items set on_hand = $2::numeric(12,3), updated_at = now() where id = $1::uuid", [itemId, nextStock.toFixed(3)]);
    await client.query("insert into public.inventory_movements (inventory_item_id, movement_type, quantity, unit_cost, notes) values ($1::uuid, $2, $3::numeric(12,3), $4::numeric(12,2), nullif($5, ''))", [itemId, type, quantity.toFixed(3), Number(found.rows[0].average_unit_cost).toFixed(2), typeof input.notes === "string" ? input.notes.trim() : ""]);
    await client.query("commit");
    return Response.json({ onHand: nextStock });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Stock movement failed." }, { status: 500 });
  } finally { client.release(); }
}
