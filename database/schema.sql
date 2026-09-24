-- Salikha Studio OS · local PostgreSQL schema reset
-- This SQL is applied directly by the standalone local PostgreSQL container.

drop table if exists public.google_calendar_connections cascade;
drop table if exists public.system_sessions cascade;
drop table if exists public.system_users cascade;
drop table if exists public.booking_consumable_usage cascade;
drop table if exists public.calendar_events cascade;
drop table if exists public.package_addons cascade;
drop table if exists public.package_recipes cascade;
drop table if exists public.equipment_maintenance cascade;
drop table if exists public.inventory_movements cascade;
drop table if exists public.inventory_items cascade;
drop table if exists public.equipment cascade;
drop table if exists public.expenses cascade;
drop table if exists public.cash_transactions cascade;
drop table if exists public.cash_accounts cascade;
drop table if exists public.payments cascade;
drop table if exists public.bookings cascade;
drop table if exists public.service_packages cascade;
drop table if exists public.clients cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.profiles cascade;

drop type if exists public.booking_status cascade;
drop type if exists public.payment_status cascade;
drop type if exists public.expense_status cascade;
drop type if exists public.user_role cascade;

create extension if not exists pgcrypto;

create table public.system_users (
  id uuid primary key default gen_random_uuid(), full_name text not null, phone text not null default '',
  email text not null unique, facebook_url text not null default '', username text not null unique,
  password_hash text not null, role text not null check (role in ('ADMIN','USER')),
  profile_photo_data text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.system_sessions (
  token_hash text primary key, user_id uuid not null references public.system_users(id) on delete cascade,
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index system_sessions_expiry_idx on public.system_sessions(expires_at);
create unique index system_users_username_lower_unique_idx on public.system_users(lower(username));
create unique index system_users_email_lower_unique_idx on public.system_users(lower(email));

create type public.user_role as enum ('OWNER', 'ADMIN', 'FINANCE', 'OPERATIONS', 'CREW', 'VIEWER');
create type public.booking_status as enum ('PENDING', 'CONFIRMED', 'DONE', 'CANCELLED', 'ARCHIVED');
create type public.payment_status as enum ('PENDING', 'PARTIAL', 'PAID', 'OVERPAID', 'REFUNDED');
create type public.expense_status as enum ('DRAFT', 'PENDING', 'SUBMITTED', 'APPROVED', 'PAID', 'VOIDED');

create table public.profiles (
  id uuid primary key,
  display_name text not null,
  role public.user_role not null default 'VIEWER',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) > 0),
  phone text,
  email text,
  facebook_url text,
  address text,
  maps_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  duration text,
  inclusions text,
  notes text,
  calendar_color text not null default '#FDE2E4',
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  package_id uuid references public.service_packages(id),
  event_name text not null check (length(trim(event_name)) > 0),
  event_date date not null,
  start_time time,
  end_time time,
  venue text,
  maps_url text,
  transport_amount numeric(12,2) not null default 0 check (transport_amount >= 0),
  actual_transport_cost numeric(12,2) not null default 0 check (actual_transport_cost >= 0),
  operator_salary numeric(12,2) not null default 0 check (operator_salary >= 0),
  addons_amount numeric(12,2) not null default 0 check (addons_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  downpayment_amount numeric(12,2) not null default 0 check (downpayment_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  balance_amount numeric(12,2) generated always as (total_amount - paid_amount) stored,
  payment_status public.payment_status generated always as (
    case when paid_amount = 0 then 'PENDING'::public.payment_status
      when paid_amount < total_amount then 'PARTIAL'::public.payment_status
      when paid_amount = total_amount then 'PAID'::public.payment_status
      else 'OVERPAID'::public.payment_status end
  ) stored,
  status public.booking_status not null default 'PENDING',
  consumables_reconciled_at timestamptz,
  cashflow_posted_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null,
  reference text,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  opening_balance numeric(12,2) not null default 0 check (opening_balance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id),
  transaction_date date not null default current_date,
  type text not null,
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  direction text not null check (direction in ('INFLOW', 'OUTFLOW')),
  status text not null default 'POSTED' check (status in ('POSTED', 'VOIDED')),
  reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id),
  reconciled_date date not null,
  actual_balance numeric(12,2) not null check (actual_balance >= 0),
  system_balance numeric(12,2) not null,
  difference numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  description text not null check (length(trim(description)) > 0),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  category text not null,
  classification text not null default 'OPERATING' check (classification in ('DIRECT', 'OPERATING')),
  account text not null default 'Cash on hand',
  status public.expense_status not null default 'PENDING',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  unit text not null default 'piece',
  pcs_per_unit numeric(12,3) not null default 1 check (pcs_per_unit > 0),
  on_hand numeric(12,3) not null default 0 check (on_hand >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  average_unit_cost numeric(12,2) not null default 0 check (average_unit_cost >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  supplier text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id),
  booking_id uuid references public.bookings(id),
  movement_type text not null check (movement_type in ('STOCK_IN', 'USAGE', 'RETURN', 'ADJUSTMENT')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  serial_number text unique,
  status text not null default 'GREAT' check (status in ('GREAT', 'NEEDS_ATTENTION', 'FOR_FIXING', 'BROKEN')),
  condition text not null default 'Camera',
  purchase_date date,
  purchase_cost numeric(12,2) not null default 0 check (purchase_cost >= 0),
  next_maintenance_date date,
  last_cleaned_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_maintenance (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  action_type text not null default 'Maintenance',
  scheduled_date date not null,
  completed_date date,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  vendor text not null default '',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.package_recipes (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.service_packages(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unique (package_id, inventory_item_id)
);

create table public.package_addons (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.service_packages(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  is_active boolean not null default true
);

create table public.booking_consumable_usage (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  consumable_name text not null check (length(trim(consumable_name)) > 0),
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  unit text not null default 'piece',
  ink_color text,
  ink_level smallint check (ink_level between 0 and 5),
  inventory_item_id uuid references public.inventory_items(id),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  pcs_per_unit numeric(12,3) not null default 1 check (pcs_per_unit > 0),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  google_event_id text unique,
  calendar_id text,
  sync_status text not null default 'PENDING' check (sync_status in ('PENDING', 'SYNCED', 'FAILED', 'REMOVED')),
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_calendar_connections (
  id boolean primary key default true check (id),
  account_email text not null,
  calendar_id text not null default 'primary',
  calendar_name text not null default 'Primary calendar',
  encrypted_refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bookings_event_date_idx on public.bookings(event_date);
create index bookings_client_id_idx on public.bookings(client_id);
create index payments_booking_id_idx on public.payments(booking_id);
create index cash_transactions_account_date_idx on public.cash_transactions(account_id, transaction_date);
create unique index cash_transactions_reference_unique_idx on public.cash_transactions(reference) where reference is not null;
create index cash_reconciliations_account_date_idx on public.cash_reconciliations(account_id, reconciled_date desc);
create index expenses_status_idx on public.expenses(status);
create index inventory_movements_item_idx on public.inventory_movements(inventory_item_id, created_at);
create index equipment_maintenance_date_idx on public.equipment_maintenance(scheduled_date);
create index package_recipes_package_idx on public.package_recipes(package_id);
create index booking_consumable_usage_booking_idx on public.booking_consumable_usage(booking_id);
create unique index booking_consumable_usage_item_unique on public.booking_consumable_usage(booking_id, inventory_item_id) where inventory_item_id is not null;
create index calendar_events_sync_status_idx on public.calendar_events(sync_status);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

-- Local/simple deployment mode: every API client is treated as an admin.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public
as $$ select true; $$;

create or replace function public.has_role(required_roles public.user_role[])
returns boolean language sql stable security definer set search_path = public
as $$ select true; $$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.service_packages enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.cash_reconciliations enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_maintenance enable row level security;
alter table public.package_recipes enable row level security;
alter table public.package_addons enable row level security;
alter table public.booking_consumable_usage enable row level security;
alter table public.calendar_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "active users read profiles" on public.profiles for select using (public.is_active_user());
create policy "admins manage profiles" on public.profiles for all using (public.has_role(array['OWNER','ADMIN']::public.user_role[]));
create policy "active users read clients" on public.clients for select using (public.is_active_user());
create policy "operations manage clients" on public.clients for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read packages" on public.service_packages for select using (public.is_active_user());
create policy "admins manage packages" on public.service_packages for all using (public.has_role(array['OWNER','ADMIN']::public.user_role[]));
create policy "active users read bookings" on public.bookings for select using (public.is_active_user());
create policy "operations manage bookings" on public.bookings for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read payments" on public.payments for select using (public.is_active_user());
create policy "finance manage payments" on public.payments for all using (public.has_role(array['OWNER','ADMIN','FINANCE']::public.user_role[]));
create policy "active users read cash accounts" on public.cash_accounts for select using (public.is_active_user());
create policy "finance manage cash accounts" on public.cash_accounts for all using (public.has_role(array['OWNER','ADMIN','FINANCE']::public.user_role[]));
create policy "active users read cash transactions" on public.cash_transactions for select using (public.is_active_user());
create policy "finance manage cash transactions" on public.cash_transactions for all using (public.has_role(array['OWNER','ADMIN','FINANCE']::public.user_role[]));
create policy "active users read cash reconciliations" on public.cash_reconciliations for select using (public.is_active_user());
create policy "finance manage cash reconciliations" on public.cash_reconciliations for all using (public.has_role(array['OWNER','ADMIN','FINANCE']::public.user_role[]));
create policy "active users read expenses" on public.expenses for select using (public.is_active_user());
create policy "finance manage expenses" on public.expenses for all using (public.has_role(array['OWNER','ADMIN','FINANCE']::public.user_role[]));
create policy "active users read inventory" on public.inventory_items for select using (public.is_active_user());
create policy "operations manage inventory" on public.inventory_items for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read inventory movements" on public.inventory_movements for select using (public.is_active_user());
create policy "operations manage inventory movements" on public.inventory_movements for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read equipment" on public.equipment for select using (public.is_active_user());
create policy "operations manage equipment" on public.equipment for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read equipment maintenance" on public.equipment_maintenance for select using (public.is_active_user());
create policy "operations manage equipment maintenance" on public.equipment_maintenance for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read package recipes" on public.package_recipes for select using (public.is_active_user());
create policy "admins manage package recipes" on public.package_recipes for all using (public.has_role(array['OWNER','ADMIN']::public.user_role[]));
create policy "active users read package addons" on public.package_addons for select using (public.is_active_user());
create policy "admins manage package addons" on public.package_addons for all using (public.has_role(array['OWNER','ADMIN']::public.user_role[]));
create policy "active users read booking consumable usage" on public.booking_consumable_usage for select using (public.is_active_user());
create policy "operations manage booking consumable usage" on public.booking_consumable_usage for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read calendar events" on public.calendar_events for select using (public.is_active_user());
create policy "operations manage calendar events" on public.calendar_events for all using (public.has_role(array['OWNER','ADMIN','OPERATIONS']::public.user_role[]));
create policy "active users read audit logs" on public.audit_logs for select using (public.is_active_user());
create policy "active users append audit logs" on public.audit_logs for insert with check (public.is_active_user());
