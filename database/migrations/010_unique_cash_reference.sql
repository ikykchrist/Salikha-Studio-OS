create unique index if not exists cash_transactions_reference_unique_idx
  on public.cash_transactions(reference)
  where reference is not null;
