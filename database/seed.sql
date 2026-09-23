-- Cash accounts seed data
insert into public.cash_accounts (name, opening_balance, is_active) values
  ('Cash on hand', 0, true),
  ('GCash', 0, true),
  ('Maya', 0, true),
  ('Bank account', 0, true)
on conflict (name) do nothing;
