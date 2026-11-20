create table if not exists public.dashboard_reminders (
  id uuid primary key,
  title text not null check (length(trim(title)) between 1 and 300),
  shared boolean not null default false,
  created_by uuid not null references public.system_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references public.system_users(id)
);
create index if not exists dashboard_reminders_open_idx on public.dashboard_reminders(created_at desc) where completed_at is null;
alter table public.dashboard_reminders enable row level security;
