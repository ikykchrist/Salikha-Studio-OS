import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { staffRoles, type StaffBooking, type StaffEvent, type StaffMember, type StaffProfile } from "../../../lib/staff-roster";
import { cents, todayManila, uuid } from "../../../lib/workflow-validation";

const headers = { "cache-control": "no-store" };
const failure = (error: string, status = 400) => Response.json({ error }, { status, headers });
const textField = (value: unknown, length: number) =>
  typeof value === "string" && value.length <= length && !value.includes("\0") ? value.trim() : null;

function profileFields(input: Record<string, unknown>): StaffProfile | null {
  const name = textField(input.name, 120);
  const address = textField(input.address, 500);
  const phone = textField(input.phone, 40);
  const email = textField(input.email, 254);
  const facebookUrl = textField(input.facebookUrl, 500);
  const assignment = staffRoles.find((role) => role === input.assignment);
  if (!name || address === null || phone === null || email === null || facebookUrl === null || !assignment) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (facebookUrl) {
    try {
      const url = new URL(facebookUrl);
      if (url.protocol !== "https:" || url.username || url.password ||
          !(url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com") || url.hostname === "fb.com")) return null;
    } catch { return null; }
  }
  return { name, address, phone, email, facebookUrl, assignment };
}

export async function GET(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  try {
    const db = getLocalPostgresPool();
    const [roster, bookings] = await Promise.all([
      db.query<StaffMember>(`
        select s.id, s.name, s.address, s.phone, s.email, s.facebook_url as "facebookUrl", s.assignment,
          count(b.id) filter (where b.status <> 'CANCELLED')::int as "eventCount",
          count(b.id) filter (where b.status in ('PENDING', 'CONFIRMED') and b.event_date >= $1::date)::int as "upcomingCount",
          coalesce(sum(a.received_amount), 0)::text as "totalReceived",
          coalesce(json_agg(json_build_object(
            'id', a.id, 'bookingId', a.booking_id, 'eventName', coalesce(b.event_name, a.event_name),
            'eventDate', case when b.id is null then a.event_date else b.event_date end,
            'status', coalesce(b.status::text, 'REMOVED'), 'receivedAmount', a.received_amount::text
          ) order by case when b.id is null then a.event_date else b.event_date end desc nulls last, a.id)
          filter (where a.id is not null), '[]'::json) as events
        from public.staff_members s
        left join public.staff_event_assignments a on a.staff_id = s.id
        left join public.bookings b on a.booking_id = b.id
        group by s.id order by lower(s.name), s.id`, [todayManila()]),
      db.query<StaffBooking>(`
        select id, event_name as "eventName", event_date::text as "eventDate", status
        from public.bookings where status <> 'CANCELLED' order by event_date desc nulls last, event_name, id`),
    ]);
    return Response.json({ staff: roster.rows, bookings: bookings.rows }, { headers });
  } catch (error) {
    console.error("Staff roster load failed", { code: (error as { code?: string })?.code });
    return failure("Could not load the staff roster.", 503);
  }
}

async function updateEvent(input: Record<string, unknown>) {
  const db = getLocalPostgresPool();
  if (input.action === "assign") {
    if (!uuid(input.staffId) || !uuid(input.bookingId)) return failure("Choose a staff member and a booking.");
    const result = await db.query(`
      insert into public.staff_event_assignments (staff_id, booking_id, event_name, event_date)
      select s.id, b.id, b.event_name, b.event_date from public.staff_members s cross join public.bookings b
      where s.id = $1 and b.id = $2 and b.status <> 'CANCELLED'
      on conflict (staff_id, booking_id) do update set booking_id = excluded.booking_id
      returning id`, [input.staffId, input.bookingId]);
    return result.rowCount ? Response.json({ saved: true }, { headers }) : failure("That staff member or booking is unavailable.", 404);
  }

  if (!uuid(input.id)) return failure("Choose an event assignment.");
  if (input.action === "unassign") {
    const result = await db.query("delete from public.staff_event_assignments where id = $1 and received_amount = 0", [input.id]);
    return result.rowCount ? Response.json({ saved: true }, { headers }) : failure("Only assignments with no recorded payout can be removed.", 409);
  }

  if (input.action === "payout") {
    let amount: number;
    try { amount = cents(input.receivedAmount); }
    catch { return failure("Enter a valid total amount received in pesos."); }
    const result = await db.query("update public.staff_event_assignments set received_amount = $2 where id = $1", [input.id, amount / 100]);
    return result.rowCount ? Response.json({ saved: true }, { headers }) : failure("Event assignment was not found.", 404);
  }
  return failure("Choose a roster action.");
}

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return failure("Enter valid roster details.");
  try {
    if (input.action !== "profile") return await updateEvent(input);
    const profile = profileFields(input);
    if (!profile || (input.id != null && !uuid(input.id))) {
      return failure("Enter a name and assignment. If supplied, use a valid email and an HTTPS Facebook link.");
    }
    const values = [profile.name, profile.address, profile.phone, profile.email, profile.facebookUrl, profile.assignment];
    const db = getLocalPostgresPool();
    const result = input.id
      ? await db.query<Pick<StaffEvent, "id">>(`update public.staff_members set name=$1,address=$2,phone=$3,email=$4,facebook_url=$5,assignment=$6 where id=$7 returning id`, [...values, input.id])
      : await db.query<Pick<StaffEvent, "id">>(`insert into public.staff_members(name,address,phone,email,facebook_url,assignment) values($1,$2,$3,$4,$5,$6) returning id`, values);
    return result.rows[0] ? Response.json({ id: result.rows[0].id }, { headers }) : failure("Staff profile was not found.", 404);
  } catch (error) {
    console.error("Staff roster save failed", { code: (error as { code?: string })?.code });
    return failure("Could not save the roster change. Try again.", 503);
  }
}
