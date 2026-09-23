alter table public.bookings
  add column if not exists downpayment_amount numeric(12,2) not null default 0 check (downpayment_amount >= 0),
  add column if not exists cashflow_posted_at timestamptz;
