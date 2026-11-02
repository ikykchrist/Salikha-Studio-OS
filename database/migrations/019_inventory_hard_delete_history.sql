-- Keep financial and stock history readable after an inventory catalog item is removed.
alter table public.inventory_movements
  add column if not exists item_name text,
  add column if not exists item_unit text;

update public.inventory_movements m
set item_name = i.name, item_unit = i.unit
from public.inventory_items i
where m.inventory_item_id = i.id and (m.item_name is null or m.item_unit is null);

alter table public.inventory_movements alter column inventory_item_id drop not null;
alter table public.inventory_movements drop constraint if exists inventory_movements_inventory_item_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_inventory_item_id_fkey
  foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;

alter table public.booking_consumable_usage drop constraint if exists booking_consumable_usage_inventory_item_id_fkey;
alter table public.booking_consumable_usage add constraint booking_consumable_usage_inventory_item_id_fkey
  foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;
