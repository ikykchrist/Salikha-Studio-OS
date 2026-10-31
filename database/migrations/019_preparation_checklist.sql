-- Additive preparation checklist fields. No stock or financial mutations.
alter table public.bookings
 add column if not exists preparation_supplies_packed boolean not null default false,
 add column if not exists preparation_equipment_checked boolean not null default false,
 add column if not exists preparation_operator_name text;
