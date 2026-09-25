alter table public.invoices
  add column if not exists booking_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(booking_details) = 'object');

create table if not exists public.invoice_settings (
  id boolean primary key default true check (id),
  logo_data_url text,
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings enable row level security;
drop policy if exists "active users read invoice settings" on public.invoice_settings;
create policy "active users read invoice settings" on public.invoice_settings for select using (public.is_active_user());
drop policy if exists "admins manage invoice settings" on public.invoice_settings;
create policy "admins manage invoice settings" on public.invoice_settings for all using (public.has_role(array['OWNER','ADMIN']::public.user_role[]));
