import 'server-only';
import {inkEstimateSchema} from './ink-estimate-store';
import {getLocalPostgresPool} from './local-postgres';
// Idempotent additive bootstrap, matching migration 020. No financial records are created.
export async function ensureInkTracker(){
 await getLocalPostgresPool().query(`create table if not exists public.printer_ink_tanks(printer_no smallint not null check(printer_no in(1,2)),color text not null check(color in('BK','C','M','Y','LC','LM')),level_percent numeric(5,2) check(level_percent between 0 and 100),bottle_ml numeric(10,3) not null default 70 check(bottle_ml>0),bottle_price numeric(12,2) not null default 130 check(bottle_price>=0),checked_at timestamptz,updated_at timestamptz not null default now(),primary key(printer_no,color));
 create table if not exists public.printer_ink_history(id uuid primary key,printer_no smallint not null,color text not null,action text not null check(action in('LEVEL','REFILL')),before_percent numeric(5,2),after_percent numeric(5,2) not null check(after_percent between 0 and 100),added_ml numeric(10,3),reference_value numeric(12,2),bottle_ml numeric(10,3) not null,bottle_price numeric(12,2) not null,notes text not null,created_by uuid,created_at timestamptz not null default now(),foreign key(printer_no,color) references public.printer_ink_tanks(printer_no,color));
 alter table public.printer_ink_tanks enable row level security;alter table public.printer_ink_history enable row level security;
 create index if not exists printer_ink_history_date_idx on public.printer_ink_history(created_at desc);
 insert into public.printer_ink_tanks(printer_no,color) select p,c from generate_series(1,2) p cross join unnest(array['BK','C','M','Y','LC','LM']) c on conflict do nothing;${inkEstimateSchema}`);
}
