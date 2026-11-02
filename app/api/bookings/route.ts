import { after } from 'next/server';
import { googleCalendarConfigured, syncGoogleCalendar } from '../../../lib/google-calendar';
import { requireUser } from '../../../lib/auth';
import { getLocalPostgresPool } from '../../../lib/local-postgres';
import { cents,uuid,validDate } from '../../../lib/workflow-validation';
export const runtime='nodejs';
export async function POST(request:Request){
 const auth=await requireUser(request);if(auth.response)return auth.response;
 const b=await request.json().catch(()=>null);
 if(!b||!uuid(b.id)||!uuid(b.clientId)||!validDate(b.date)||!String(b.eventName||'').trim())return Response.json({error:'Select a client, event and valid date.'},{status:400});
 const db=await getLocalPostgresPool().connect();
 try{const total=cents(b.total);const deposit=cents(b.downpaymentAmount??0);const basePrice=cents(b.basePrice??0);const transport=cents(b.transportAmount??0);const addonIds=b.addonIds??[];
 if(!Array.isArray(addonIds)||addonIds.length>30||new Set(addonIds).size!==addonIds.length||addonIds.some(id=>!uuid(id)))throw Error('Choose valid add-ons from the selected package.');
 if(b.packageId!==null&&b.packageId!==undefined&&!uuid(b.packageId))throw Error('Choose a valid package.');
 if(addonIds.length&&!b.packageId)throw Error('Choose a package before selecting add-ons.');
 await db.query('begin');
 await db.query('select pg_advisory_xact_lock(hashtext($1))',[b.id]);
 const found=await db.query('select id,status,created_by,paid_amount as "paidAmount",downpayment_amount as "downpaymentAmount" from public.bookings where id=$1',[b.id]);if(found.rowCount){if(found.rows[0].created_by!==auth.user!.id)throw Error('This booking reference is already in use.');await db.query('commit');return Response.json({booking:found.rows[0]});}
 const addonRows=addonIds.length?(await db.query('select id,name,price from public.package_addons where id=any($1::uuid[]) and package_id=$2::uuid and is_active=true for share',[addonIds,b.packageId])).rows:[];
 if(addonRows.length!==addonIds.length)throw Error('One or more add-ons changed. Refresh the package and try again.');
 const addonSnapshot=addonIds.map(id=>{const row=addonRows.find((item:{id:string})=>item.id===id);return {id:row.id,name:row.name,price:Number(row.price)};});
 const addonAmount=addonSnapshot.reduce((sum,item)=>sum+cents(item.price),0);
 if(b.basePrice!==undefined&&total!==basePrice+transport+addonAmount)throw Error('Booking total changed. Review the package, add-ons and transportation.');
 if(deposit>total||(total>0&&deposit<=0))throw Error('A downpayment greater than zero and no more than the booking total is required.');
 if(deposit>0&&(!uuid(b.paymentAccountId)||!validDate(b.paymentDate)))throw Error('Choose the receiving account and actual downpayment date.');
 const account=deposit>0?(await db.query('select id,name from public.cash_accounts where id=$1 and is_active for update',[b.paymentAccountId])).rows[0]:null;
 if(deposit>0&&!account)throw Error('Choose an active receiving account.');
 if(addonSnapshot.length){const column=await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='addons_snapshot'");if(!column.rowCount)await db.query("alter table public.bookings add column if not exists addons_snapshot jsonb not null default '[]'::jsonb");}
 const saved=await db.query(`insert into public.bookings(id,client_id,package_id,event_name,event_date,start_time,end_time,venue,maps_url,total_amount,transport_amount,addons_amount,downpayment_amount,paid_amount,notes,created_by${addonSnapshot.length?',addons_snapshot':''}) values($1,$2,$3,$4,$5,nullif($6,'')::time,nullif($7,'')::time,$8,$9,$10,$11,$12,$13,$13,$14,$15${addonSnapshot.length?',$16::jsonb':''}) returning id,status,paid_amount as "paidAmount",downpayment_amount as "downpaymentAmount"`,[b.id,b.clientId,b.packageId||null,b.eventName,b.date,b.startTime||'',b.endTime||'',b.venue||null,b.mapsUrl||null,total/100,transport/100,addonAmount/100,deposit/100,b.notes||null,auth.user!.id,...(addonSnapshot.length?[JSON.stringify(addonSnapshot)]:[])]);
 if(deposit>0){
  const reference=`booking-deposit:${b.id}`;
  await db.query(`insert into public.cash_transactions(account_id,transaction_date,type,description,amount,direction,status,reference,created_by,purpose,booking_id,external_reference) values($1,$2,'BOOKING_RECEIPT',$3,$4,'INFLOW','POSTED',$5,$6,'BOOKING_RECEIPT',$7,$8)`,[account.id,b.paymentDate,`Downpayment - ${String(b.eventName).trim()}`,deposit/100,reference,auth.user!.id,b.id,String(b.paymentReference||'').trim().slice(0,250)||null]);
  await db.query('insert into public.payments(booking_id,amount,payment_date,method,reference,created_by) values($1,$2,$3,$4,$5,$6)',[b.id,deposit/100,b.paymentDate,account.name,reference,auth.user!.id]);
 }
 await db.query("insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values($1,'BOOKING_CREATE','bookings',$2,$3::jsonb)",[auth.user!.id,b.id,JSON.stringify({packageId:b.packageId||null,addonSnapshot,total:total/100})]);await db.query('commit'); if(googleCalendarConfigured()) after(async()=>{try{await syncGoogleCalendar(b.id);}catch{console.error('Calendar sync deferred; retry from Calendar.');}}); return Response.json({booking:saved.rows[0],calendarSync:{queued:googleCalendarConfigured(),requestedAt:new Date().toISOString()}});
 }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Could not create booking.'},{status:400});}finally{db.release();}
}
