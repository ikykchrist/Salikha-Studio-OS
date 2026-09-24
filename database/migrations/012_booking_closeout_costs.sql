alter table public.bookings
  add column if not exists actual_transport_cost numeric(12,2) not null default 0 check (actual_transport_cost >= 0),
  add column if not exists operator_salary numeric(12,2) not null default 0 check (operator_salary >= 0);
