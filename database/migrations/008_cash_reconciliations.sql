create table if not exists public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id),
  reconciled_date date not null,
  actual_balance numeric(12,2) not null check (actual_balance >= 0),
  system_balance numeric(12,2) not null,
  difference numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists cash_reconciliations_account_date_idx
  on public.cash_reconciliations(account_id, reconciled_date desc);
