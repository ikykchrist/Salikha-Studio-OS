import { requireUser } from "../../../lib/auth";
import { preparationReady, type Preparation } from "../../../lib/booking-preparation";
import { getLocalPostgresPool } from "../../../lib/local-postgres";
import { availableOperators, linkStaffAssignment, lockStaffSchedule, releasePreparationAssignment, scheduledBookingStatuses, staffMemberAvailable, staffScheduleBooking } from "../../../lib/staff-schedule";
import { uuid } from "../../../lib/workflow-validation";

const headers = { "cache-control": "no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

const preparationColumns = `b.id,
  b.preparation_layout_ready as "layoutReady", b.preparation_venue_ready as "venueReady",
  b.preparation_backdrop_color as "backdropColor", b.preparation_supplies_packed as "suppliesPacked",
  b.preparation_equipment_checked as "equipmentChecked", b.preparation_operator_id as "operatorId"`;

export async function POST(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || !uuid(body.id)) return failure("A valid booking ID is required.", 400);

  const color = typeof body.backdropColor === "string" ? body.backdropColor.trim() || null : null;
  if (color && (color.length > 80 || /[\u0000-\u001f]/.test(color))) return failure("Backdrop color must be 80 characters or fewer.", 400);
  if (body.operatorId !== undefined && body.operatorId !== null && !uuid(body.operatorId)) return failure("Choose an operator from the Staff Roster.", 400);

  const db = await getLocalPostgresPool().connect();
  let committed = false;
  try {
    await db.query("begin");
    await lockStaffSchedule(db);
    const booking = await staffScheduleBooking(db, body.id, true);
    if (!booking) return failure("Booking not found.", 404);

    // Omitted operator preserves existing assignments and legacy names on checklist-only saves.
    const operatorId = body.operatorId === undefined ? booking.operatorId : body.operatorId;
    let operatorName = body.operatorId === null ? null : booking.operatorName;
    if (operatorId && operatorId !== booking.operatorId) {
      if (!booking.eventDate || !scheduledBookingStatuses.includes(booking.status)) {
        return failure("Set an event date on an active booking before assigning an operator.", 409);
      }
      const operator = await staffMemberAvailable(db, booking, operatorId);
      if (!operator) return failure("This staff member is no longer in the roster.", 404);
      if (!operator.available) return failure("This operator already has an event on that date. Choose another operator.", 409);
      await linkStaffAssignment(db, booking.id, operatorId, true);
      operatorName = operator.name;
    }
    if (booking.operatorId && operatorId !== booking.operatorId) {
      await releasePreparationAssignment(db, booking.id, booking.operatorId);
    }

    const { rows } = await db.query<Preparation>(`
      update public.bookings b set preparation_layout_ready=$2, preparation_venue_ready=$3,
        preparation_backdrop_color=$4, preparation_supplies_packed=$5, preparation_equipment_checked=$6,
        preparation_operator_id=$7, preparation_operator_name=$8, updated_at=now()
      where b.id=$1 returning ${preparationColumns}, coalesce(
        (select s.name from public.staff_members s where s.id = b.preparation_operator_id),
        b.preparation_operator_name) as "operatorName"`,
      [booking.id, body.layoutReady === true, body.venueReady === true, color,
        body.suppliesPacked === true, body.equipmentChecked === true, operatorId, operatorName],
    );
    await db.query("commit");
    committed = true;
    return Response.json({ preparation: rows[0], readyForDeployment: preparationReady(rows[0]) }, { headers });
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
      const operators = await availableOperators(db, booking);
      return Response.json({ operators, scheduledDate: booking.eventDate, operatorId: booking.operatorId, operatorName: booking.operatorName, canAssign: scheduledBookingStatuses.includes(booking.status) }, { headers });
    }

    const { rows } = await db.query(`
      select ${preparationColumns}, coalesce(s.name, b.preparation_operator_name) as "operatorName"
      from public.bookings b left join public.staff_members s on s.id = b.preparation_operator_id`);
    return Response.json({ data: rows }, { headers });
  } catch {
    return failure("Preparation checklist could not load.", 503);
  }
}
