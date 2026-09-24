create table if not exists public.system_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null default '',
  email text not null unique,
  facebook_url text not null default '',
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('ADMIN','USER')),
  profile_photo_data text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.system_sessions (
  token_hash text primary key,
  user_id uuid not null references public.system_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists system_sessions_expiry_idx on public.system_sessions(expires_at);
create unique index if not exists system_users_username_lower_unique_idx on public.system_users(lower(username));
create unique index if not exists system_users_email_lower_unique_idx on public.system_users(lower(email));
