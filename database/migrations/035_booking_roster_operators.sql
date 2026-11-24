alter table public.bookings
  add column if not exists event_end_date date,
  add column if not exists preparation_operator_id uuid references public.staff_members(id) on delete restrict;

alter table public.staff_event_assignments
  add column if not exists preparation_only boolean not null default false,
  add column if not exists scheduled boolean not null default true;
