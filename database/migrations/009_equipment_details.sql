alter table public.equipment
  add column if not exists purchase_date date,
  add column if not exists purchase_cost numeric(12,2) not null default 0 check (purchase_cost >= 0),
  add column if not exists next_maintenance_date date,
  add column if not exists last_cleaned_date date;
