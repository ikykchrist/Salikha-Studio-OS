create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  facebook_url text not null default '',
  assignment text not null check (assignment in ('Photobooth Operator', 'Photoman Operator')),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_event_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  event_name text not null,
  event_date date,
  received_amount numeric(12,2) not null default 0 check (received_amount >= 0),
  unique (staff_id, booking_id)
);

create index if not exists staff_event_assignments_booking_idx on public.staff_event_assignments(booking_id);

alter table public.staff_members enable row level security;
alter table public.staff_event_assignments enable row level security;
revoke all on public.staff_members, public.staff_event_assignments from anon, authenticated;
