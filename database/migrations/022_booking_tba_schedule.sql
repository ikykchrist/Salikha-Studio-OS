-- An unscheduled booking has no event date. Times may also be added later.
alter table public.bookings alter column event_date drop not null;
