create table if not exists public.google_calendar_connections (
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
