-- Run only after reviewing historical records: DONE is treated as fully paid.
update public.bookings
   set downpayment_amount = discount_amount,
       paid_amount = case when status = 'DONE' then total_amount else greatest(paid_amount, discount_amount) end,
       discount_amount = 0
 where discount_amount <> 0 or (status = 'DONE' and paid_amount <> total_amount);

insert into public.cash_accounts (name, opening_balance, is_active)
values ('Cash on hand', 0, true)
on conflict (name) do nothing;

insert into public.cash_transactions (account_id, transaction_date, type, description, amount, direction, status, reference)
select a.id, b.event_date, 'Booking payment', 'Downpayment received — ' || b.event_name,
       b.downpayment_amount, 'INFLOW', 'POSTED', 'booking-completion:' || b.id || ':downpayment'
  from public.bookings b
  join public.cash_accounts a on a.name = 'Cash on hand' and a.is_active
 where b.status = 'DONE' and b.downpayment_amount > 0
   and not exists (select 1 from public.cash_transactions t where t.reference = 'booking-completion:' || b.id || ':downpayment');

insert into public.cash_transactions (account_id, transaction_date, type, description, amount, direction, status, reference)
select a.id, b.event_date, 'Booking payment', 'Booking balance received — ' || b.event_name,
       b.total_amount - b.downpayment_amount, 'INFLOW', 'POSTED', 'booking-completion:' || b.id || ':balance'
  from public.bookings b
  join public.cash_accounts a on a.name = 'Cash on hand' and a.is_active
 where b.status = 'DONE' and b.total_amount > b.downpayment_amount
   and not exists (select 1 from public.cash_transactions t where t.reference = 'booking-completion:' || b.id || ':balance');

update public.bookings set cashflow_posted_at = now() where status = 'DONE' and cashflow_posted_at is null;
