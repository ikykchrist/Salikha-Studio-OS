create table if not exists public.invoice_email_connections (
  id boolean primary key default true check (id),
  account_email text not null,
  encrypted_refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoice_email_connections enable row level security;
