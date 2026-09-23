import { getLocalPostgresPool } from "../../../lib/local-postgres";
import type { PoolClient } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quantityPattern = /^(?:\d{1,9})(?:\.\d{1,3})?$/;
type Line = { inventoryItemId: unknown; quantity: unknown };

export async function POST(request: Request) {
  let body: { bookingId?: unknown; lines?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (typeof body.bookingId !== "string" || !uuidPattern.test(body.bookingId)) return Response.json({ error: "A valid bookingId is required." }, { status: 400 });
  if (!Array.isArray(body.lines) || body.lines.length > 100) return Response.json({ error: "Usage must contain at most 100 lines." }, { status: 400 });

  const lines: { inventoryItemId: string; quantity: number }[] = [];
  const seen = new Set<string>();
  for (const raw of body.lines as Line[]) {
    if (!raw || typeof raw.inventoryItemId !== "string" || !uuidPattern.test(raw.inventoryItemId)) return Response.json({ error: "Choose a valid inventory item for every usage line." }, { status: 400 });
    const quantity = String(raw.quantity ?? "").trim();
    if (!quantityPattern.test(quantity)) return Response.json({ error: "Usage quantities must be zero or greater with at most three decimal places." }, { status: 400 });
    if (seen.has(raw.inventoryItemId)) return Response.json({ error: "An inventory item can appear only once." }, { status: 400 });
    seen.add(raw.inventoryItemId);
    lines.push({ inventoryItemId: raw.inventoryItemId, quantity: Number(quantity) });
  }

  const client: PoolClient = await getLocalPostgresPool().connect();
  try {
    await client.query("begin");
    const bookingResult = await client.query(
      "select id, package_id, event_name, status, consumables_reconciled_at from public.bookings where id = $1 for update",
      [body.bookingId],
    );
    if (!bookingResult.rowCount) { await client.query("rollback"); return Response.json({ error: "Booking not found." }, { status: 404 }); }
    const booking = bookingResult.rows[0];
    if (booking.status !== "DONE") { await client.query("rollback"); return Response.json({ error: "Only a completed booking can be reconciled." }, { status: 409 }); }
    if (booking.consumables_reconciled_at) { await client.query("rollback"); return Response.json({ error: "Consumable usage has already been recorded for this booking." }, { status: 409 }); }

    const allowedResult = await client.query("select inventory_item_id from public.package_recipes where package_id = $1", [booking.package_id]);
    const allowed = new Set<string>(allowedResult.rows.map((row: { inventory_item_id: string }) => row.inventory_item_id));
    if (lines.some((line) => !allowed.has(line.inventoryItemId))) { await client.query("rollback"); return Response.json({ error: "Usage must contain only ingredients in this package recipe." }, { status: 400 }); }

    let totalCost = 0;
    for (const line of lines) {
      if (line.quantity === 0) continue;
      const itemResult = await client.query(
        "select id, name, unit, on_hand, average_unit_cost, pcs_per_unit from public.inventory_items where id = $1 and is_active for update",
        [line.inventoryItemId],
      );
      if (!itemResult.rowCount) { await client.query("rollback"); return Response.json({ error: "An ingredient is missing or inactive." }, { status: 409 }); }
      const item = itemResult.rows[0];
      const quantity = Number(line.quantity);
      const stock = Number(item.on_hand);
      if (quantity > stock) { await client.query("rollback"); return Response.json({ error: `Not enough ${item.name}: ${stock} ${item.unit} available.` }, { status: 409 }); }
      const unitCost = Number(item.average_unit_cost);
      const pcsPerUnit = Number(item.pcs_per_unit);
      const cost = Math.round(quantity * pcsPerUnit * (unitCost / pcsPerUnit) * 100) / 100;
      totalCost += cost;
      await client.query("update public.inventory_items set on_hand = on_hand - $2, updated_at = now() where id = $1", [item.id, quantity]);
      await client.query(
        "insert into public.inventory_movements (inventory_item_id, booking_id, movement_type, quantity, unit_cost, notes) values ($1, $2, 'USAGE', $3, $4, $5)",
        [item.id, booking.id, quantity, unitCost, `Used for ${booking.event_name}`],
      );
      await client.query(
        "insert into public.booking_consumable_usage (booking_id, inventory_item_id, consumable_name, quantity, unit, unit_cost, pcs_per_unit) values ($1, $2, $3, $4, $5, $6, $7)",
        [booking.id, item.id, item.name, quantity, item.unit, unitCost, pcsPerUnit],
      );
      if (cost > 0) await client.query(
        "insert into public.expenses (booking_id, description, amount, expense_date, category, classification, account, status, notes) values ($1, $2, $3, current_date, 'Consumables', 'DIRECT', 'Cash on hand', 'PAID', $4)",
        [booking.id, `${item.name} used for ${booking.event_name}`, cost, `${quantity} ${item.unit}; ${pcsPerUnit} pcs per ${item.unit}; ₱${(unitCost / pcsPerUnit).toFixed(4)} per piece`],
      );
    }
    await client.query("update public.bookings set consumables_reconciled_at = now(), updated_at = now() where id = $1", [booking.id]);
    await client.query("commit");
    return Response.json({ ok: true, totalCost: Number(totalCost.toFixed(2)) });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not record booking usage." }, { status: 500 });
  } finally { client.release(); }
}
