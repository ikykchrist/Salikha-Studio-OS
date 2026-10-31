import 'server-only';
import type {PoolClient} from 'pg';
import {estimatePrintInk} from './ink-estimate';
export const inkEstimateSchema=`
create table if not exists public.printer_ink_profiles(printer_no smallint primary key check(printer_no in(1,2)),ml_per_sheet numeric(8,5) not null default 0.2 check(ml_per_sheet>0 and ml_per_sheet<=10),reference_capacity_ml numeric(10,3) not null default 70 check(reference_capacity_ml>0),updated_at timestamptz not null default now());
create table if not exists public.printer_ink_consumption(id uuid primary key default gen_random_uuid(),booking_id uuid not null unique references public.bookings(id),printer_no smallint not null references public.printer_ink_profiles(printer_no),printed_sheets integer not null check(printed_sheets>0),total_ml numeric(16,6) not null,estimated_cost numeric(12,2) not null,ml_per_sheet numeric(8,5) not null,reference_capacity_ml numeric(10,3) not null,color_details jsonb not null,event_date date not null,created_by uuid,created_at timestamptz not null default now());
alter table public.printer_ink_profiles enable row level security;alter table public.printer_ink_consumption enable row level security;
insert into public.printer_ink_profiles(printer_no) values(1),(2) on conflict do nothing;
create index if not exists printer_ink_consumption_date_idx on public.printer_ink_consumption(event_date);
`;
export async function recordEstimatedInk(db:PoolClient,booking:{id:string;event_date:string},printerNo:number,sheets:number,actor:string){
 if(![1,2].includes(printerNo))throw Error('Select Printer 1 or Printer 2 for the printed sheets.');
 const profile=await db.query('select * from public.printer_ink_profiles where printer_no=$1 for share',[printerNo]);if(!profile.rowCount)throw Error('Ink estimation profile is unavailable.');
 const tanks=await db.query('select * from public.printer_ink_tanks where printer_no=$1 order by color for update',[printerNo]);
 const estimate=estimatePrintInk(sheets,Number(profile.rows[0].ml_per_sheet),Number(profile.rows[0].reference_capacity_ml),tanks.rows);
 for(const c of estimate.colors)await db.query('update public.printer_ink_tanks set level_percent=$3,updated_at=now() where printer_no=$1 and color=$2',[printerNo,c.color,c.afterPercent]);
 await db.query('insert into public.printer_ink_consumption(booking_id,printer_no,printed_sheets,total_ml,estimated_cost,ml_per_sheet,reference_capacity_ml,color_details,event_date,created_by) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)',[booking.id,printerNo,sheets,estimate.totalMl,estimate.cost,estimate.mlPerSheet,estimate.referenceMl,JSON.stringify(estimate.colors),booking.event_date,actor]);
 return {...estimate,printerNo};
}
