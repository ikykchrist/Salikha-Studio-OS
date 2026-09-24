import { getLocalPostgresPool } from "../../../lib/local-postgres";
import type { PoolClient } from "pg";
import { requireUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quantityPattern = /^(?:\d{1,9})(?:\.\d{1,3})?$/;

type RecipeInput = { inventoryItemId: unknown; quantity: unknown };
type RecipeRequest = { packageId: unknown; lines: unknown };

async function getRecipe(client: Pick<PoolClient, "query">, packageId: string) {
  const { rows } = await client.query(
    `select r.id, r.inventory_item_id as "inventoryItemId", i.name as "itemName",
            i.unit, r.quantity::text as quantity, i.on_hand::text as "onHand",
            i.average_unit_cost::text as "unitCost", i.pcs_per_unit::text as "pcsPerUnit",
            (i.average_unit_cost / i.pcs_per_unit)::text as "pieceCost",
            (r.quantity * i.average_unit_cost)::text as "lineCost", i.is_active as active
       from public.package_recipes r
       join public.inventory_items i on i.id = r.inventory_item_id
      where r.package_id = $1::uuid
      order by i.name, r.id`,
    [packageId],
  );
  return rows;
}

export async function GET(request: Request) {
  const auth = await requireUser(request); if (auth.response) return auth.response;
  const packageId = new URL(request.url).searchParams.get("packageId");
  if (!packageId || !uuidPattern.test(packageId)) return Response.json({ error: "A valid packageId is required." }, { status: 400 });

  try {
    const pool = getLocalPostgresPool();
    const [packageResult, recipe, inventory] = await Promise.all([
      pool.query("select id, duration, inclusions, base_price as \"basePrice\" from public.service_packages where id = $1::uuid", [packageId]),
      getRecipe(pool, packageId),
      pool.query("select id, name, unit, on_hand::text as \"onHand\", average_unit_cost::text as \"unitCost\", pcs_per_unit::text as \"pcsPerUnit\", (average_unit_cost / pcs_per_unit)::text as \"pieceCost\", is_active as active from public.inventory_items order by is_active desc, name"),
    ]);
    if (!packageResult.rowCount) return Response.json({ error: "Package not found." }, { status: 404 });
    return Response.json({ data: recipe, inventory: inventory.rows, package: packageResult.rows[0] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load this recipe." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireUser(request); if (auth.response) return auth.response;
  let body: RecipeRequest;
  try {
    body = await request.json() as RecipeRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { packageId, lines } = body;
  if (typeof packageId !== "string" || !uuidPattern.test(packageId)) return Response.json({ error: "A valid packageId is required." }, { status: 400 });
  if (!Array.isArray(lines) || lines.length > 100) return Response.json({ error: "Recipe must contain 0–100 ingredient lines." }, { status: 400 });

  const parsed: { inventoryItemId: string; quantity: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines as RecipeInput[]) {
    if (!line || typeof line !== "object" || typeof line.inventoryItemId !== "string" || !uuidPattern.test(line.inventoryItemId)) {
      return Response.json({ error: "Choose a valid inventory item for every recipe line." }, { status: 400 });
    }
    const quantity = String(line.quantity ?? "").trim();
    if (!quantityPattern.test(quantity) || Number(quantity) <= 0) return Response.json({ error: "Each quantity must be greater than zero and use at most three decimal places." }, { status: 400 });
    if (seen.has(line.inventoryItemId)) return Response.json({ error: "An inventory item can appear only once in a recipe." }, { status: 400 });
    seen.add(line.inventoryItemId);
    parsed.push({ inventoryItemId: line.inventoryItemId, quantity });
  }

  const pool = getLocalPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const packageResult = await client.query("select id from public.service_packages where id = $1::uuid for update", [packageId]);
    if (!packageResult.rowCount) {
      await client.query("rollback");
      return Response.json({ error: "Package not found." }, { status: 404 });
    }

    const currentRows = await client.query("select inventory_item_id from public.package_recipes where package_id = $1::uuid", [packageId]);
    const existingItems = new Set<string>(currentRows.rows.map((row: { inventory_item_id: string }) => row.inventory_item_id));
    const itemIds = parsed.map((line) => line.inventoryItemId);
    if (itemIds.length) {
      const itemResult = await client.query(
        "select id, is_active from public.inventory_items where id = any($1::uuid[]) for key share",
        [itemIds],
      );
      const items = new Map<string, boolean>(itemResult.rows.map((row: { id: string; is_active: boolean }) => [row.id, row.is_active]));
      if (items.size !== itemIds.length) {
        await client.query("rollback");
        return Response.json({ error: "One or more selected inventory items no longer exist." }, { status: 400 });
      }
      if (parsed.some((line) => !items.get(line.inventoryItemId) && !existingItems.has(line.inventoryItemId))) {
        await client.query("rollback");
        return Response.json({ error: "Inactive inventory items can remain in a recipe, but cannot be newly added." }, { status: 400 });
      }
    }

    await client.query("delete from public.package_recipes where package_id = $1::uuid", [packageId]);
    if (parsed.length) {
      const values: unknown[] = [];
      const tuples = parsed.map((line) => {
        values.push(packageId, line.inventoryItemId, line.quantity);
        const start = values.length - 3;
        return `($${start + 1}::uuid, $${start + 2}::uuid, $${start + 3}::numeric)`;
      });
      await client.query(
        `insert into public.package_recipes (package_id, inventory_item_id, quantity) values ${tuples.join(", ")}`,
        values,
      );
    }
    const recipe = await getRecipe(client, packageId);
    await client.query("commit");
    return Response.json({ data: recipe });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not save this recipe." }, { status: 500 });
  } finally {
    client.release();
  }
}
