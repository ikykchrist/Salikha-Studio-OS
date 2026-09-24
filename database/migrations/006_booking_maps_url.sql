alter table public.bookings
  add column if not exists maps_url text;
