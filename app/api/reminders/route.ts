import { requireUser } from "../../../lib/auth";
import { reminderStore } from "../../../lib/reminder-store";
import { uuid } from "../../../lib/workflow-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const unavailable = () => reply({ error: "Reminders are unavailable. Please try again." }, 503);

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  try {
    const db = await reminderStore();
    const archived = new URL(request.url).searchParams.get("view") === "archives";
    const result = await db.query(archived
      ? "select id, title, shared from public.dashboard_reminders where completed_at is not null and (shared or $1) order by completed_at desc, id"
      : "select id, title, shared from public.dashboard_reminders where completed_at is null and (shared or $1) order by created_at desc, id",
    [auth.user.role === "ADMIN"]);
    return reply({ reminders: result.rows });
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => null);
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (!uuid(input?.id) || !title || title.length > 300 || typeof input.shared !== "boolean") {
    return reply({ error: "Enter a to-do of up to 300 characters and choose its visibility." }, 400);
  }
  try {
    const db = await reminderStore();
    const result = await db.query(`insert into public.dashboard_reminders as r (id,title,shared,created_by)
      values ($1,$2,$3,$4) on conflict (id) do update set title = r.title
      where r.created_by = excluded.created_by and r.title = excluded.title and r.shared = excluded.shared
      returning id, title, shared, completed_at`, [input.id, title, input.shared, auth.user.id]);
    if (!result.rowCount) return reply({ error: "This request has already been used. Reopen Add To Do to start another." }, 409);
    return reply({ reminder: result.rows[0].completed_at ? null : result.rows[0] });
  } catch { return unavailable(); }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => null);
  if (!uuid(input?.id)) return reply({ error: "Choose a valid reminder." }, 400);
  try {
    const db = await reminderStore();
    const params = [input.id, auth.user.id, auth.user.role === "ADMIN"];
    const result = await db.query(`update public.dashboard_reminders set completed_at = now(), completed_by = $2
      where id = $1 and completed_at is null and (shared or $3)`, params);
    if (!result.rowCount) {
      const visible = await db.query("select 1 from public.dashboard_reminders where id = $1 and (shared or $2)", [input.id, auth.user.role === "ADMIN"]);
      if (!visible.rowCount) return reply({ error: "This reminder is unavailable." }, 404);
    }
    return reply({ completed: true });
  } catch { return unavailable(); }
}

export async function DELETE(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => null);
  if (!Array.isArray(input?.ids) || !input.ids.length || !input.ids.every(uuid)) {
    return reply({ error: "Choose archived to-dos to delete." }, 400);
  }
  try {
    const db = await reminderStore();
    await db.query("delete from public.dashboard_reminders where completed_at is not null and id = any($1::uuid[])", [input.ids]);
    return reply({ ok: true });
  } catch { return unavailable(); }
}
