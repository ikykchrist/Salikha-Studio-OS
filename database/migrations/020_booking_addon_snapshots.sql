alter table public.bookings
  add column if not exists addons_snapshot jsonb not null default '[]'::jsonb;
