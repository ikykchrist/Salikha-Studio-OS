import { after } from 'next/server';
import { googleCalendarConfigured, syncGoogleCalendar } from '../../../lib/google-calendar';
import { getLocalPostgresPool } from '../../../lib/local-postgres';
import { requireUser } from '../../../lib/auth';
import { cents,uuid,validDate } from '../../../lib/workflow-validation';
export const runtime='nodejs';
export async function POST(request:Request){
 const auth=await requireUser(request);if(auth.response)return auth.response;
 const body=await request.json().catch(()=>null);
 if(!body||!uuid(body.id)||!validDate(body.date)||!String(body.eventName||'').trim()||!['PENDING','DONE','CANCELLED'].includes(body.status))return Response.json({error:'Enter a valid booking, date, event and status.'},{status:400});
 const db=await getLocalPostgresPool().connect();
 try{
  const total=cents(body.total);await db.query('begin');
  const found=await db.query('select *,event_date::text as saved_date from public.bookings where id=$1 for update',[body.id]);const current=found.rows[0];if(!current)throw Error('Booking not found.');
  if(total<Math.round(Number(current.paid_amount)*100))throw Error('The total cannot be less than recorded payments. Review and void an incorrect payment first.');
  if(body.status==='DONE'&&Math.round(Number(current.paid_amount)*100)<total)throw Error('Full payment is required before completion. Record the actual payment in Cashflow or use Collect payment.');
  if(current.status==='DONE'&&(total!==Math.round(Number(current.total_amount)*100)||body.date!==current.saved_date)&&body.status==='DONE')throw Error('Reopen the completed booking before changing its value or event date.');
  if(body.mapsUrl&&!/^https?:\/\//i.test(String(body.mapsUrl)))throw Error('Enter a valid map URL.');
  const saved=await db.query(`update public.bookings set event_name=$2,event_date=$3,start_time=nullif($4,'')::time,end_time=nullif($5,'')::time,venue=nullif($6,''),maps_url=nullif($7,''),total_amount=$8,status=$9,updated_at=now() where id=$1 returning id,paid_amount as "paidAmount",downpayment_amount as "downpaymentAmount",status`,[body.id,String(body.eventName).trim(),body.date,body.startTime||'',body.endTime||'',body.venue||'',body.mapsUrl||'',total/100,body.status]);
  await db.query("insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values($1,'BOOKING_UPDATE','bookings',$2,$3::jsonb)",[auth.user!.id,body.id,JSON.stringify({before:{status:current.status,total:current.total_amount},after:{status:body.status,total:total/100}})]);
  await db.query('commit'); if(googleCalendarConfigured()) after(async()=>{try{await syncGoogleCalendar(body.id);}catch{console.error('Calendar sync deferred; retry from Calendar.');}}); return Response.json({booking:saved.rows[0]});
 }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Could not save booking.'},{status:400});}finally{db.release();}
}
