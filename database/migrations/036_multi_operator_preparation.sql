alter table public.staff_event_assignments
  add column if not exists preparation_selected boolean not null default false;

insert into public.staff_event_assignments
  (staff_id, booking_id, event_name, event_date, preparation_only, preparation_selected)
select preparation_operator_id, id, event_name, event_date, true, true
from public.bookings where preparation_operator_id is not null
on conflict (staff_id, booking_id) do update
set preparation_selected = true, scheduled = true;
