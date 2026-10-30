-- Additive workflow upgrade. Never reset or infer historical payments.
begin;
alter table public.cash_transactions add column if not exists purpose text not null default 'LEGACY';
alter table public.cash_transactions add column if not exists booking_id uuid references public.bookings(id);
alter table public.cash_transactions add column if not exists expense_id uuid references public.expenses(id);
alter table public.cash_transactions add column if not exists external_reference text;
alter table public.cash_transactions add column if not exists void_reason text;
alter table public.cash_transactions add column if not exists voided_at timestamptz;
alter table public.expenses add column if not exists accounting_treatment text not null default 'EXPENSE' check (accounting_treatment in ('EXPENSE','INVENTORY_PURCHASE'));
alter table public.expenses add column if not exists receipt_reference text;
alter table public.expenses add column if not exists paid_date date;
alter table public.inventory_movements add column if not exists reference text;
alter table public.inventory_movements add column if not exists expense_id uuid references public.expenses(id);
alter table public.inventory_movements add column if not exists movement_date date;
create unique index if not exists inventory_movement_reference_idx on public.inventory_movements(reference) where reference is not null;
create table if not exists public.client_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  kind text not null check (kind in ('NOTE','CALL','EMAIL','CHAT','FOLLOW_UP')),
  summary text not null check (length(trim(summary)) > 0),
  due_date date, completed_at timestamptz, created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists client_activities_due_idx on public.client_activities(due_date) where completed_at is null;
alter table public.client_activities enable row level security;
create index if not exists cash_transactions_booking_idx on public.cash_transactions(booking_id);
create index if not exists cash_transactions_expense_idx on public.cash_transactions(expense_id);
commit;
