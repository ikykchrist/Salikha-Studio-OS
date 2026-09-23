import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await getLocalPostgresPool().query(
      `select p.id as "packageId", count(r.id)::int as "ingredientCount",
              coalesce(sum(r.quantity * i.average_unit_cost), 0)::numeric(12,2)::text as "recipeCost"
         from public.service_packages p
         left join public.package_recipes r on r.package_id = p.id
         left join public.inventory_items i on i.id = r.inventory_item_id
        group by p.id`,
    );
    return Response.json({ data: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load recipe summaries." }, { status: 503 });
  }
}
