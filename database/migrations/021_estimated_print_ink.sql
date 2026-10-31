-- Editable assumptions; estimated cost is non-cash and recognized once per event.

create table if not exists public.printer_ink_profiles(printer_no smallint primary key check(printer_no in(1,2)),ml_per_sheet numeric(8,5) not null default 0.2 check(ml_per_sheet>0 and ml_per_sheet<=10),reference_capacity_ml numeric(10,3) not null default 70 check(reference_capacity_ml>0),updated_at timestamptz not null default now());
create table if not exists public.printer_ink_consumption(id uuid primary key default gen_random_uuid(),booking_id uuid not null unique references public.bookings(id),printer_no smallint not null references public.printer_ink_profiles(printer_no),printed_sheets integer not null check(printed_sheets>0),total_ml numeric(16,6) not null,estimated_cost numeric(12,2) not null,ml_per_sheet numeric(8,5) not null,reference_capacity_ml numeric(10,3) not null,color_details jsonb not null,event_date date not null,created_by uuid,created_at timestamptz not null default now());
alter table public.printer_ink_profiles enable row level security;alter table public.printer_ink_consumption enable row level security;
insert into public.printer_ink_profiles(printer_no) values(1),(2) on conflict do nothing;
create index if not exists printer_ink_consumption_date_idx on public.printer_ink_consumption(event_date);
