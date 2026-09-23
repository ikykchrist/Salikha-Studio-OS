alter table public.inventory_items
  add column if not exists pcs_per_unit numeric(12,3) not null default 1 check (pcs_per_unit > 0);

alter table public.booking_consumable_usage
  add column if not exists inventory_item_id uuid references public.inventory_items(id),
  add column if not exists unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  add column if not exists pcs_per_unit numeric(12,3) not null default 1 check (pcs_per_unit > 0);

create unique index if not exists booking_consumable_usage_item_unique
  on public.booking_consumable_usage(booking_id, inventory_item_id)
  where inventory_item_id is not null;

alter table public.bookings add column if not exists consumables_reconciled_at timestamptz;
alter table public.inventory_movements add column if not exists booking_id uuid references public.bookings(id);
