create table if not exists public.telegram_booking_drafts (
  id uuid primary key default gen_random_uuid(),
  source_update_id bigint not null unique,
  telegram_user_id bigint not null,
  chat_id bigint not null,
  source_text text not null,
  parsed jsonb not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','CONFIRMED','CANCELLED')),
  booking_id uuid references public.bookings(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists telegram_booking_drafts_user_idx on public.telegram_booking_drafts(telegram_user_id, created_at desc);
create table if not exists public.telegram_allowed_users (
  telegram_user_id bigint primary key,
  approved_by uuid not null references public.system_users(id),
  approved_at timestamptz not null default now()
);
create table if not exists public.telegram_bot_config (
  id boolean primary key default true check(id),
  encrypted_token text not null,
  bot_username text not null,
  updated_at timestamptz not null default now()
);
alter table public.telegram_booking_drafts enable row level security;
alter table public.telegram_allowed_users enable row level security;
alter table public.telegram_bot_config enable row level security;
