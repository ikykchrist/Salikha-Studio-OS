import { requireUser } from "../../../lib/auth";
import { preparationReady, type Preparation } from "../../../lib/booking-preparation";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { availableOperators, checkStaffAvailability, linkStaffAssignment, lockStaffSchedule, preparationOperators, releasePreparationAssignment, scheduledBookingStatuses, staffScheduleBooking } from "../../../lib/staff-schedule";
import { uuid } from "../../../lib/workflow-validation";

const headers = { "cache-control": "no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

const preparationColumns = `b.id,
  b.preparation_layout_ready as "layoutReady", b.preparation_venue_ready as "venueReady",
  b.preparation_backdrop_color as "backdropColor", b.preparation_supplies_packed as "suppliesPacked",
  b.preparation_equipment_checked as "equipmentChecked"`;

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || !uuid(body.id)) return failure("A valid booking ID is required.", 400);

  const color = typeof body.backdropColor === "string" ? body.backdropColor.trim() || null : null;
  if (color && (color.length > 80 || /[\u0000-\u001f]/.test(color))) return failure("Backdrop color must be 80 characters or fewer.", 400);
  const requested = body.operatorIds;
  if (requested !== undefined && (!Array.isArray(requested) || !requested.every(uuid))) {
    return failure("Choose operators from the Staff Roster.", 400);
  }
  if (body.operatorId !== undefined && body.operatorId !== null && !uuid(body.operatorId)) {
    return failure("Choose an operator from the Staff Roster.", 400);
  }

  const db = await getLocalPostgresPool().connect();
  let committed = false;
  try {
    await db.query("begin");
    await lockStaffSchedule(db);
    const booking = await staffScheduleBooking(db, body.id, true);
    if (!booking) return failure("Booking not found.", 404);

    const assigned = await preparationOperators(db, booking.id);
    const currentIds = assigned.map(({ id }) => id);
    const updatingOperators = requested !== undefined || body.operatorId !== undefined;
    // A checklist-only save keeps any roster selections and a pre-roster operator name.
    const legacySelection = body.operatorId === undefined ? currentIds : [
      ...(body.operatorId ? [body.operatorId] : []), ...currentIds.filter((id) => id !== booking.operatorId),
    ];
    const operatorIds = [...new Set<string>((requested ?? legacySelection).map((id: string) => id.toLowerCase()))];
    const added = operatorIds.filter((id) => !currentIds.includes(id));
    const removed = currentIds.filter((id) => !operatorIds.includes(id));
    let selectedNames = assigned.map(({ name }) => name);

    if (added.length) {
      if (!booking.eventDate || !scheduledBookingStatuses.includes(booking.status)) {
        return failure("Set an event date on an active booking before assigning operators.", 409);
      }
      const operators = await checkStaffAvailability(db, booking, added);
      if (operators.length !== added.length) return failure("One or more operators are no longer in the roster.", 404);
      const unavailable = operators.find((operator) => !operator.available);
      if (unavailable) return failure(`${unavailable.name} already has an event on that date. Choose another operator.`, 409);
      for (const id of added) await linkStaffAssignment(db, booking.id, id, true);
    }
    for (const id of removed) await releasePreparationAssignment(db, booking.id, id);
    if (added.length || removed.length) selectedNames = (await preparationOperators(db, booking.id)).map(({ name }) => name);
    const legacyName = updatingOperators || selectedNames.length ? null : booking.operatorName;

    const { rows } = await db.query<Preparation>(`
      update public.bookings b set preparation_layout_ready=$2, preparation_venue_ready=$3,
        preparation_backdrop_color=$4, preparation_supplies_packed=$5, preparation_equipment_checked=$6,
        preparation_operator_id=$7, preparation_operator_name=$8, updated_at=now()
      where b.id=$1 returning ${preparationColumns}`,
      [booking.id, body.layoutReady === true, body.venueReady === true, color,
        body.suppliesPacked === true, body.equipmentChecked === true, operatorIds[0] ?? null,
        selectedNames.join(", ") || legacyName],
    );
    const preparation = { ...rows[0], operatorIds, operatorId: operatorIds[0] ?? null, operatorName: selectedNames.join(", ") || legacyName };
    await db.query("commit");
    committed = true;
    return Response.json({ preparation, readyForDeployment: preparationReady(preparation) }, { headers });
  } catch (error) {
    console.error("Booking preparation save failed", { code: (error as { code?: string })?.code });
    return failure("Could not save preparation checklist.", 503);
  } finally {
    if (!committed) await db.query("rollback").catch(() => {});
    db.release();
  }
}

export async function GET(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  try {
    const db = getLocalPostgresPool();
    const bookingId = new URL(request.url).searchParams.get("bookingId");
    if (bookingId !== null) {
      if (!uuid(bookingId)) return failure("A valid booking ID is required.", 400);
      const booking = await staffScheduleBooking(db, bookingId);
      if (!booking) return failure("Booking not found.", 404);
      const assigned = await preparationOperators(db, bookingId);
      const operators = await availableOperators(db, booking, assigned.map(({ id }) => id));
      return Response.json({
        operators, assigned, scheduledDate: booking.eventDate,
        operatorId: booking.operatorId, operatorName: booking.operatorName,
        legacyName: assigned.length ? null : booking.operatorName,
        canAssign: scheduledBookingStatuses.includes(booking.status),
      }, { headers });
    }

    const { rows } = await db.query(`
      select ${preparationColumns}, b.preparation_operator_id as "operatorId", coalesce(p.ids, '{}'::uuid[]) as "operatorIds",
        coalesce(p.names, b.preparation_operator_name) as "operatorName"
      from public.bookings b
      left join lateral (
        select array_agg(s.id order by lower(s.name), s.id) as ids,
          string_agg(s.name, ', ' order by lower(s.name), s.id) as names
        from public.staff_event_assignments a join public.staff_members s on s.id = a.staff_id
        where a.booking_id=b.id and a.preparation_selected and a.scheduled
      ) p on true`);
    return Response.json({ data: rows }, { headers });
  } catch {
    return failure("Preparation checklist could not load.", 503);
  }
}
