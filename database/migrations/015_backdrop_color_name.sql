alter table public.bookings drop constraint if exists bookings_preparation_backdrop_color_check;
alter table public.bookings
  add constraint bookings_preparation_backdrop_color_check
  check (preparation_backdrop_color is null or length(trim(preparation_backdrop_color)) between 1 and 80);
