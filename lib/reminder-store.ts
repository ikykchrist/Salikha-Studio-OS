import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLocalPostgresPool } from "./local-postgres";

async function prepareTable() {
  const db = await getLocalPostgresPool().connect();
  try {
    const exists = await db.query("select to_regclass('public.dashboard_reminders') is not null as ready");
    if (exists.rows[0].ready) return;
    const sql = await readFile(path.join(process.cwd(), "database/migrations/031_dashboard_reminders.sql"), "utf8");
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtext('studio_dashboard_reminders_v1'))");
    await db.query(sql);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}

let schemaReady: Promise<void> | undefined;
export async function reminderStore() {
  schemaReady ??= prepareTable().catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
  return getLocalPostgresPool();
}
