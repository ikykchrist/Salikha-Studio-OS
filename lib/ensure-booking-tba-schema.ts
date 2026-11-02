import type { PoolClient } from "pg";

export async function ensureBookingTbaSchema(db: PoolClient) {
  const { rows } = await db.query<{ is_nullable: string }>(
    "select is_nullable from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='event_date'",
  );
  if (rows[0]?.is_nullable === "NO") {
    await db.query("alter table public.bookings alter column event_date drop not null");
  }
}
