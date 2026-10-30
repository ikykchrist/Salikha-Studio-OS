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
 try{const total=cents(b.total);await db.query('begin');
 const found=await db.query('select id,status from public.bookings where id=$1',[b.id]);if(found.rowCount){await db.query('commit');return Response.json({booking:found.rows[0]});}
 const saved=await db.query(`insert into public.bookings(id,client_id,package_id,event_name,event_date,start_time,end_time,venue,maps_url,total_amount,downpayment_amount,paid_amount,notes,created_by) values($1,$2,$3,$4,$5,nullif($6,'')::time,nullif($7,'')::time,$8,$9,$10,0,0,$11,$12) returning id,status`,[b.id,b.clientId,b.packageId||null,b.eventName,b.date,b.startTime||'',b.endTime||'',b.venue||null,b.mapsUrl||null,total/100,b.notes||null,auth.user!.id]);
 await db.query("insert into public.audit_logs(actor_id,action,entity_type,entity_id) values($1,'BOOKING_CREATE','bookings',$2)",[auth.user!.id,b.id]);await db.query('commit'); if(googleCalendarConfigured()) after(async()=>{try{await syncGoogleCalendar(b.id);}catch{console.error('Calendar sync deferred; retry from Calendar.');}}); return Response.json({booking:saved.rows[0]});
 }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Could not create booking.'},{status:400});}finally{db.release();}
}
