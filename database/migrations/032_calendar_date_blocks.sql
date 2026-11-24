create table if not exists public.calendar_date_blocks (
  event_date date not null,
  service text not null check (service in ('Photobooth', 'Photoman', 'Coverage')),
  blocked_by uuid references public.system_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_date, service)
);

alter table public.calendar_date_blocks enable row level security;
revoke all on public.calendar_date_blocks from anon, authenticated;
