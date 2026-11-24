import { requireUser } from "../../../lib/auth";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { staffRoles, type StaffBooking, type StaffEvent, type StaffMember, type StaffProfile } from "../../../lib/staff-roster";
import { linkStaffAssignment, lockStaffSchedule, staffMemberAvailable, staffScheduleBooking } from "../../../lib/staff-schedule";
import { staffPhotoMaxBytes, staffPhotoMaxEdge } from "../../../lib/staff-profile-photo";
import { cents, todayManila, uuid } from "../../../lib/workflow-validation";

const headers = { "cache-control": "no-store" };
const failure = (error: string, status = 400) => Response.json({ error }, { status, headers });
const textField = (value: unknown, length: number) =>
  typeof value === "string" && value.length <= length && !value.includes("\0") ? value.trim() : null;

const maxRosterRequest = 120 * 1024;
class RosterRequestTooLarge extends Error {}

async function readRosterRequest(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxRosterRequest) throw new RosterRequestTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(body + decoder.decode());
      bytes += value.byteLength;
      if (bytes > maxRosterRequest) {
        await reader.cancel().catch(() => {});
        throw new RosterRequestTooLarge();
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function decodeStaffPhoto(value: unknown): Buffer | undefined {
  const prefix = "data:image/jpeg;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix) || value.length > prefix.length + Math.ceil(staffPhotoMaxBytes / 3) * 4) return;
  const encoded = value.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return;
  const photo = Buffer.from(encoded, "base64");
  if (photo.length < 12 || photo.length > staffPhotoMaxBytes || photo.readUInt16BE(0) !== 0xffd8 ||
      photo.readUInt16BE(photo.length - 2) !== 0xffd9 || photo.toString("base64") !== encoded) return;

  // Read only the JPEG frame header to cap pixel dimensions without decoding on the server.
  for (let offset = 2; offset + 3 < photo.length;) {
    if (photo[offset++] !== 0xff) return;
    while (photo[offset] === 0xff) offset++;
    if (offset + 2 >= photo.length) return;
    const marker = photo[offset++];
    if (marker === 0xda || marker === 0xd9 || marker === 0x00) return;
    const length = photo.readUInt16BE(offset);
    if (length < 2 || offset + length > photo.length) return;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) return;
      const height = photo.readUInt16BE(offset + 3);
      const width = photo.readUInt16BE(offset + 5);
      if (width >= 1 && width <= staffPhotoMaxEdge && height >= 1 && height <= staffPhotoMaxEdge) return photo;
      return;
    }
    offset += length;
  }
}

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
          s.profile_photo_updated_at::text as "photoVersion",
          count(b.id) filter (where a.scheduled and b.status <> 'CANCELLED')::int as "eventCount",
          count(b.id) filter (where a.scheduled and b.status in ('PENDING', 'CONFIRMED') and b.event_date >= $1::date)::int as "upcomingCount",
          coalesce(sum(a.received_amount), 0)::text as "totalReceived",
          coalesce(json_agg(json_build_object(
            'id', a.id, 'bookingId', a.booking_id, 'eventName', coalesce(b.event_name, a.event_name),
            'eventDate', case when b.id is null then a.event_date else b.event_date end,
            'status', case when not a.scheduled then 'UNASSIGNED' else coalesce(b.status::text, 'REMOVED') end, 'receivedAmount', a.received_amount::text
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
  if (input.action === "assign" || input.action === "unassign") {
    const assign = input.action === "assign";
    if (assign ? !uuid(input.staffId) || !uuid(input.bookingId) : !uuid(input.id)) {
      return failure("Choose a staff member and a booking.");
    }
    const client = await db.connect();
    let committed = false;
    try {
      await client.query("begin");
      await lockStaffSchedule(client);
      if (assign) {
        const booking = await staffScheduleBooking(client, input.bookingId as string, true);
        if (!booking || booking.status === "CANCELLED") return failure("That booking is unavailable.", 404);
        const staffId = input.staffId as string;
        const operator = await staffMemberAvailable(client, booking, staffId);
        if (!operator) return failure("That staff member is unavailable.", 404);
        if (!operator.available) return failure("This staff member already has an event on that date.", 409);
        await linkStaffAssignment(client, booking.id, staffId, false);
      } else {
        const result = await client.query<{ booking_id: string | null; staff_id: string }>(
          "delete from public.staff_event_assignments where id = $1 and received_amount = 0 returning booking_id, staff_id", [input.id],
        );
        const removed = result.rows[0];
        if (!removed) return failure("Only assignments with no recorded payout can be removed.", 409);
        if (removed.booking_id) {
          await client.query(`update public.bookings set preparation_operator_id=null, preparation_operator_name=null, updated_at=now()
            where id=$1 and preparation_operator_id=$2`, [removed.booking_id, removed.staff_id]);
        }
      }
      await client.query("commit");
      committed = true;
      return Response.json({ saved: true }, { headers });
    } finally {
      if (!committed) await client.query("rollback").catch(() => {});
      client.release();
    }
  }

  if (!uuid(input.id)) return failure("Choose an event assignment.");
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
  let body: unknown;
  try { body = await readRosterRequest(request); }
  catch (error) {
    return error instanceof RosterRequestTooLarge ? failure("The profile upload is too large.", 413) : failure("Enter valid roster details.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Enter valid roster details.");
  const input = body as Record<string, unknown>;
  try {
    if (input.action !== "profile") return await updateEvent(input);
    const profile = profileFields(input);
    if (!profile || (input.id != null && !uuid(input.id))) {
      return failure("Enter a name and assignment. If supplied, use a valid email and an HTTPS Facebook link.");
    }
    const changePhoto = input.profilePhoto !== undefined;
    const photo = input.profilePhoto == null ? null : decodeStaffPhoto(input.profilePhoto);
    if (photo === undefined) return failure("Choose a valid compressed JPEG photo up to 384 pixels and 80 KB.");
    const values = [profile.name, profile.address, profile.phone, profile.email, profile.facebookUrl, profile.assignment, photo];
    const db = getLocalPostgresPool();
    const result = input.id
      ? await db.query<Pick<StaffEvent, "id">>(`
        update public.staff_members set name=$1,address=$2,phone=$3,email=$4,facebook_url=$5,assignment=$6,
          profile_photo=case when $8 then $7::bytea else profile_photo end,
          profile_photo_updated_at=case when $8 then case when $7::bytea is not null then clock_timestamp() end else profile_photo_updated_at end
        where id=$9 returning id`, [...values, changePhoto, input.id])
      : await db.query<Pick<StaffEvent, "id">>(`
        insert into public.staff_members(name,address,phone,email,facebook_url,assignment,profile_photo,profile_photo_updated_at)
        values($1,$2,$3,$4,$5,$6,$7::bytea,case when $7::bytea is not null then clock_timestamp() end) returning id`, values);
    return result.rows[0] ? Response.json({ id: result.rows[0].id }, { headers }) : failure("Staff profile was not found.", 404);
  } catch (error) {
    console.error("Staff roster save failed", { code: (error as { code?: string })?.code });
    return failure("Could not save the roster change. Try again.", 503);
  }
}
