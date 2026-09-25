create sequence if not exists public.invoice_number_seq;
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('SAL-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0')),
  client_id uuid not null references public.clients(id),
  booking_id uuid references public.bookings(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SENT', 'VOID')),
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  terms text,
  email_sent_to text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_client_date_idx on public.invoices (client_id, issue_date desc);
create index if not exists invoices_booking_idx on public.invoices (booking_id) where booking_id is not null;
create unique index if not exists invoices_one_active_per_booking_idx on public.invoices (booking_id) where booking_id is not null and status <> 'VOID';
alter table public.invoices enable row level security;
drop policy if exists "active users read invoices" on public.invoices;
create policy "active users read invoices" on public.invoices for select using (public.is_active_user());
drop policy if exists "admins manage invoices" on public.invoices;
create policy "admins manage invoices" on public.invoices for all using (public.has_role(array['OWNER','ADMIN']::public.user_role[]));
