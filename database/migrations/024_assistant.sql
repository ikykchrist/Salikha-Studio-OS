create table if not exists public.assistant_config (
  id boolean primary key default true check(id),
  encrypted_api_key text not null,
  model text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.assistant_daily_usage (
  user_id uuid not null references public.system_users(id),
  usage_date date not null,
  request_count integer not null default 0,
  primary key(user_id, usage_date)
);
alter table public.assistant_config enable row level security;
alter table public.assistant_daily_usage enable row level security;
