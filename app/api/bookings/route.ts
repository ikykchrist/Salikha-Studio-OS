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
 try{const total=cents(b.total);const deposit=cents(b.downpaymentAmount??0);await db.query('begin');
 await db.query('select pg_advisory_xact_lock(hashtext($1))',[b.id]);
 const found=await db.query('select id,status,created_by,paid_amount as "paidAmount",downpayment_amount as "downpaymentAmount" from public.bookings where id=$1',[b.id]);if(found.rowCount){if(found.rows[0].created_by!==auth.user!.id)throw Error('This booking reference is already in use.');await db.query('commit');return Response.json({booking:found.rows[0]});}
 if(deposit>total||(total>0&&deposit<=0))throw Error('A downpayment greater than zero and no more than the booking total is required.');
 if(deposit>0&&(!uuid(b.paymentAccountId)||!validDate(b.paymentDate)))throw Error('Choose the receiving account and actual downpayment date.');
 const account=deposit>0?(await db.query('select id,name from public.cash_accounts where id=$1 and is_active for update',[b.paymentAccountId])).rows[0]:null;
 if(deposit>0&&!account)throw Error('Choose an active receiving account.');
 const saved=await db.query(`insert into public.bookings(id,client_id,package_id,event_name,event_date,start_time,end_time,venue,maps_url,total_amount,downpayment_amount,paid_amount,notes,created_by) values($1,$2,$3,$4,$5,nullif($6,'')::time,nullif($7,'')::time,$8,$9,$10,$11,$11,$12,$13) returning id,status,paid_amount as "paidAmount",downpayment_amount as "downpaymentAmount"`,[b.id,b.clientId,b.packageId||null,b.eventName,b.date,b.startTime||'',b.endTime||'',b.venue||null,b.mapsUrl||null,total/100,deposit/100,b.notes||null,auth.user!.id]);
 if(deposit>0){
  const reference=`booking-deposit:${b.id}`;
  await db.query(`insert into public.cash_transactions(account_id,transaction_date,type,description,amount,direction,status,reference,created_by,purpose,booking_id,external_reference) values($1,$2,'BOOKING_RECEIPT',$3,$4,'INFLOW','POSTED',$5,$6,'BOOKING_RECEIPT',$7,$8)`,[account.id,b.paymentDate,`Downpayment - ${String(b.eventName).trim()}`,deposit/100,reference,auth.user!.id,b.id,String(b.paymentReference||'').trim().slice(0,250)||null]);
  await db.query('insert into public.payments(booking_id,amount,payment_date,method,reference,created_by) values($1,$2,$3,$4,$5,$6)',[b.id,deposit/100,b.paymentDate,account.name,reference,auth.user!.id]);
 }
 await db.query("insert into public.audit_logs(actor_id,action,entity_type,entity_id) values($1,'BOOKING_CREATE','bookings',$2)",[auth.user!.id,b.id]);await db.query('commit'); if(googleCalendarConfigured()) after(async()=>{try{await syncGoogleCalendar(b.id);}catch{console.error('Calendar sync deferred; retry from Calendar.');}}); return Response.json({booking:saved.rows[0]});
 }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Could not create booking.'},{status:400});}finally{db.release();}
}
