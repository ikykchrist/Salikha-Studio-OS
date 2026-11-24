import type { Pool, PoolClient } from "pg";
import type { StaffRole } from "./staff-roster";

export const scheduledBookingStatuses = ["PENDING", "CONFIRMED", "DONE"];
const scheduledStatus = "('PENDING','CONFIRMED','DONE')";

// An event ending exactly at midnight does not occupy the following calendar date.
const lastBookedDay = `case when b.end_time = time '00:00' and b.event_end_date > b.event_date
  then b.event_end_date - 1 else greatest(b.event_date, b.event_end_date) end`;

export type StaffScheduleBooking = {
  id: string;
  eventDate: string | null;
  lastDate: string | null;
  status: string;
  operatorId: string | null;
  operatorName: string | null;
};

export type OperatorOption = { id: string; name: string; assignment: StaffRole };
type Database = Pool | PoolClient;

export async function staffScheduleBooking(db: Database, id: string, lock = false) {
  const { rows } = await db.query<StaffScheduleBooking>(`
    select b.id, b.event_date::text as "eventDate", (${lastBookedDay})::text as "lastDate",
      b.status, b.preparation_operator_id as "operatorId", b.preparation_operator_name as "operatorName"
    from public.bookings b where b.id = $1${lock ? " for update" : ""}`, [id]);
  return rows[0];
}

export async function lockStaffSchedule(db: PoolClient) {
  await db.query("select pg_advisory_xact_lock(hashtext('staff-event-schedule'))");
}

const availableStaff = `not exists (
  select 1 from public.bookings b
  where b.id <> $1 and b.status in ${scheduledStatus}
    and b.event_date <= $3::date and (${lastBookedDay}) >= $2::date
    and (
      b.preparation_operator_id = s.id
      or (b.preparation_operator_id is null and lower(btrim(b.preparation_operator_name)) = lower(btrim(s.name)))
      or exists (select 1 from public.staff_event_assignments a where a.booking_id = b.id and a.staff_id = s.id and a.scheduled)
    )
)`;

export async function availableOperators(db: Database, booking: StaffScheduleBooking) {
  if (!booking.eventDate || !scheduledBookingStatuses.includes(booking.status)) return [];
  const { rows } = await db.query<OperatorOption>(`
    select s.id, s.name, s.assignment from public.staff_members s
    where ${availableStaff} or s.id = $4::uuid
    order by lower(s.name), s.id`, [booking.id, booking.eventDate, booking.lastDate, booking.operatorId]);
  return rows;
}

export async function staffMemberAvailable(db: Database, booking: StaffScheduleBooking, staffId: string) {
  const { rows } = await db.query<{ name: string; available: boolean }>(`
    select s.name, ${availableStaff} as available from public.staff_members s where s.id = $4`,
    [booking.id, booking.eventDate, booking.lastDate, staffId]);
  return rows[0];
}

export async function bookingStaffConflict(db: Database, id: string, newDate: string) {
  const { rowCount } = await db.query(`
    select 1 from public.staff_members s join public.bookings current_booking on current_booking.id = $1
    where (current_booking.preparation_operator_id = s.id
      or (current_booking.preparation_operator_id is null and lower(btrim(current_booking.preparation_operator_name)) = lower(btrim(s.name)))
      or exists (select 1 from public.staff_event_assignments a where a.booking_id = $1 and a.staff_id = s.id and a.scheduled))
      and not ${availableStaff} limit 1`, [id, newDate, newDate]);
  return Boolean(rowCount);
}

export async function linkStaffAssignment(db: PoolClient, bookingId: string, staffId: string, preparationOnly: boolean) {
  const { rowCount } = await db.query(`
    insert into public.staff_event_assignments (staff_id, booking_id, event_name, event_date, preparation_only)
    select s.id, b.id, b.event_name, b.event_date, $3 from public.staff_members s cross join public.bookings b
    where s.id = $1 and b.id = $2 and b.status <> 'CANCELLED'
    on conflict (staff_id, booking_id) do update set
      scheduled = true,
      preparation_only = (not staff_event_assignments.scheduled or staff_event_assignments.preparation_only) and excluded.preparation_only
    returning id`, [staffId, bookingId, preparationOnly]);
  return Boolean(rowCount);
}

export async function releasePreparationAssignment(db: PoolClient, bookingId: string, staffId: string) {
  await db.query(`
    delete from public.staff_event_assignments
    where booking_id=$1 and staff_id=$2 and preparation_only and received_amount=0`, [bookingId, staffId]);
  await db.query(`
    update public.staff_event_assignments set scheduled=false
    where booking_id=$1 and staff_id=$2 and preparation_only`, [bookingId, staffId]);
}
