import type { PoolClient } from "pg";

/** Bring older deployed databases to the history-safe inventory delete schema. */
export async function ensureInventoryHistorySchema(db: PoolClient) {
  const ready = await db.query(`
    select
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inventory_movements' and column_name = 'item_name') as has_name,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inventory_movements' and column_name = 'item_unit') as has_unit,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inventory_movements' and column_name = 'inventory_item_id' and is_nullable = 'YES') as nullable_id,
      (select confdeltype = 'n' from pg_constraint where conrelid = 'public.inventory_movements'::regclass and conname = 'inventory_movements_inventory_item_id_fkey') as movement_set_null,
      (select confdeltype = 'n' from pg_constraint where conrelid = 'public.booking_consumable_usage'::regclass and conname = 'booking_consumable_usage_inventory_item_id_fkey') as usage_set_null
  `);
  if (Object.values(ready.rows[0]).every(Boolean)) return;
  await db.query("select pg_advisory_xact_lock(hashtext('salikha_inventory_history_schema_v1'))");
  await db.query("alter table public.inventory_movements add column if not exists item_name text");
  await db.query("alter table public.inventory_movements add column if not exists item_unit text");
  await db.query("alter table public.inventory_movements alter column inventory_item_id drop not null");
  for (const table of ["inventory_movements", "booking_consumable_usage"] as const) {
    const constraint = `${table}_inventory_item_id_fkey`;
    const result = await db.query(
      "select confdeltype from pg_constraint where conrelid = $1::regclass and conname = $2",
      [`public.${table}`, constraint],
    );
    if (result.rows[0]?.confdeltype === "n") continue;
    await db.query(`alter table public.${table} drop constraint if exists ${constraint}`);
    await db.query(`alter table public.${table} add constraint ${constraint} foreign key (inventory_item_id) references public.inventory_items(id) on delete set null`);
  }
}
