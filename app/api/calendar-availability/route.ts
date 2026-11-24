import { requireUser } from "../../../lib/auth";
import { calendarServices, type CalendarBlocks, type CalendarService } from "../../../lib/calendar-date-blocks";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { validDate } from "../../../lib/workflow-validation";

const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json({ error: "Choose a valid month." }, { status: 400, headers });
  }

  try {
    const { rows } = await getLocalPostgresPool().query<{ date: string; service: CalendarService }>(
      `select event_date::text as date, service from public.calendar_date_blocks
       where event_date >= $1::date and event_date < $1::date + interval '1 month'
       order by event_date, service`, [month + "-01"],
    );
    const blocks: CalendarBlocks = {};
    for (const row of rows) (blocks[row.date] ??= []).push(row.service);
    return Response.json({ blocks }, { headers });
  } catch (error) {
    console.error("Calendar date blocks load failed", { code: (error as { code?: string })?.code });
    return Response.json({ error: "Date blocks could not be loaded." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => null);
  if (!input || !Array.isArray(input.dates) || !input.dates.length || input.dates.length > 366 ||
      !input.dates.every(validDate) || (input.scope !== "All" && !calendarServices.includes(input.scope)) ||
      (input.action !== "block" && input.action !== "unblock")) {
    return Response.json({ error: "Choose up to 366 valid dates, a service, and an action." }, { status: 400, headers });
  }

  const dates = [...new Set<string>(input.dates)].sort();
  const services = input.scope === "All" ? calendarServices : [input.scope];
  try {
    const db = await getLocalPostgresPool().connect();
    try {
      await db.query("begin");
      // Serialize changes with public inquiries so a submission sees the committed availability.
      await db.query("select pg_advisory_xact_lock(hashtext('public-booking-inquiry'))");
      if (input.action === "block") {
        await db.query(
          `insert into public.calendar_date_blocks (event_date, service, blocked_by)
           select dates.event_date, services.service, $3::uuid
           from unnest($1::date[]) as dates(event_date)
           cross join unnest($2::text[]) as services(service)
           on conflict (event_date, service) do nothing`, [dates, services, auth.user.id],
        );
      } else {
        await db.query(
          "delete from public.calendar_date_blocks where event_date = any($1::date[]) and service = any($2::text[])",
          [dates, services],
        );
      }
      await db.query("commit");
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    } finally {
      db.release();
    }
    return Response.json({ saved: true }, { headers });
  } catch (error) {
    console.error("Calendar date blocks save failed", { code: (error as { code?: string })?.code });
    return Response.json({ error: "Date blocks could not be saved. Try again." }, { status: 503, headers });
  }
}
