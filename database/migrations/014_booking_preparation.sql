alter table public.bookings
  add column if not exists preparation_layout_ready boolean not null default false,
  add column if not exists preparation_venue_ready boolean not null default false,
  add column if not exists preparation_backdrop_color text;

alter table public.bookings
  add constraint bookings_preparation_backdrop_color_check
  check (preparation_backdrop_color is null or preparation_backdrop_color ~ '^#[0-9A-Fa-f]{6}$');
