import "server-only";
import { getLocalPostgresPool } from "./local-postgres";
import { decryptGoogleToken, encryptGoogleToken } from "./google-calendar";

let ready = false;
export async function ensureAssistantSchema() {
  if (ready) return;
  const pool = getLocalPostgresPool();
  await pool.query(`create table if not exists public.assistant_config (
    id boolean primary key default true check (id),
    encrypted_api_key text not null,
    model text not null,
    updated_at timestamptz not null default now()
  )`);
  await pool.query(`create table if not exists public.assistant_daily_usage (
    user_id uuid not null references public.system_users(id),
    usage_date date not null,
    request_count integer not null default 0,
    primary key (user_id, usage_date)
  )`);
  await pool.query("alter table public.assistant_config enable row level security");
  await pool.query("alter table public.assistant_daily_usage enable row level security");
  ready = true;
}

export async function assistantConfig() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL) return { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, source: "environment" as const };
  await ensureAssistantSchema();
  const { rows } = await getLocalPostgresPool().query("select encrypted_api_key, model from public.assistant_config where id=true");
  if (!rows[0]) return null;
  return { key: decryptGoogleToken(rows[0].encrypted_api_key as string), model: rows[0].model as string, source: "settings" as const };
}

export async function saveAssistantConfig(key: string, model: string) {
  await ensureAssistantSchema();
  await getLocalPostgresPool().query(`insert into public.assistant_config(id,encrypted_api_key,model)
    values(true,$1,$2) on conflict(id) do update set encrypted_api_key=excluded.encrypted_api_key,model=excluded.model,updated_at=now()`, [encryptGoogleToken(key), model]);
}
