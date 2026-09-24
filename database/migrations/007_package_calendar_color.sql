alter table public.service_packages
  add column if not exists calendar_color text not null default '#FDE2E4';
