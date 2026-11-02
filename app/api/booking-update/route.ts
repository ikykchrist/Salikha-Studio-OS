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
  const packageId=body.packageId===undefined?current.package_id:body.packageId===null||body.packageId===''?null:body.packageId;
  if(packageId!==null&&!uuid(packageId))throw Error('Choose a valid package.');
  if(current.status==='DONE'&&packageId!==current.package_id&&body.status==='DONE')throw Error('Reopen the completed booking before changing its package.');
  if(packageId&&packageId!==current.package_id){const pack=await db.query('select id from public.service_packages where id=$1 and is_active=true',[packageId]);if(!pack.rowCount)throw Error('This package is unavailable. Choose an active package.');}
  const addonIds=body.addonIds;
  if(addonIds!==undefined&&(!Array.isArray(addonIds)||addonIds.length>30||new Set(addonIds).size!==addonIds.length||addonIds.some(id=>!uuid(id))))throw Error('Choose valid add-ons from the package.');
  if(addonIds?.length&&!packageId)throw Error('Choose a package before adding add-ons.');
  const oldAddons=Array.isArray(current.addons_snapshot)?current.addons_snapshot as Array<{id:string;name:string;price:number}>:[];
  let addonSnapshot=oldAddons;
  if(addonIds!==undefined){
    const retained=new Map(packageId===current.package_id?oldAddons.map(item=>[item.id,item]):[]);
    const newIds=(addonIds as string[]).filter(id=>!retained.has(id));
    const fresh=newIds.length?(await db.query('select id,name,price from public.package_addons where id=any($1::uuid[]) and package_id=$2::uuid and is_active=true for share',[newIds,packageId])).rows:[];
    if(fresh.length!==newIds.length)throw Error('An add-on is no longer available. Refresh and try again.');
    const freshById=new Map(fresh.map((item:{id:string;name:string;price:string})=>[item.id,{id:item.id,name:item.name,price:Number(item.price)}]));
    addonSnapshot=(addonIds as string[]).map(id=>retained.get(id)||freshById.get(id)!);
    if(current.status==='DONE'&&body.status==='DONE'&&JSON.stringify(addonSnapshot)!==JSON.stringify(oldAddons))throw Error('Reopen the completed booking before changing its add-ons.');
  }
  const addonAmount=addonSnapshot.reduce((sum,item)=>sum+cents(item.price),0);
  let addonColumn=false;
  if(addonIds!==undefined){const column=await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='addons_snapshot'");addonColumn=Boolean(column.rowCount);if(!addonColumn&&addonSnapshot.length){await db.query("alter table public.bookings add column if not exists addons_snapshot jsonb not null default '[]'::jsonb");addonColumn=true;}}
  if(body.mapsUrl&&!/^https?:\/\//i.test(String(body.mapsUrl)))throw Error('Enter a valid map URL.');
  const saved=await db.query(`update public.bookings set event_name=$2,event_date=$3,start_time=nullif($4,'')::time,end_time=nullif($5,'')::time,venue=nullif($6,''),maps_url=nullif($7,''),total_amount=$8,status=$9,package_id=$10,addons_amount=$11${addonColumn?',addons_snapshot=$12::jsonb':''},updated_at=now() where id=$1 returning id,package_id as "packageId",paid_amount as "paidAmount",downpayment_amount as "downpaymentAmount",status`,[body.id,String(body.eventName).trim(),body.date,body.startTime||'',body.endTime||'',body.venue||'',body.mapsUrl||'',total/100,body.status,packageId,addonAmount/100,...(addonColumn?[JSON.stringify(addonSnapshot)]:[])]);
  await db.query("insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values($1,'BOOKING_UPDATE','bookings',$2,$3::jsonb)",[auth.user!.id,body.id,JSON.stringify({before:{status:current.status,total:current.total_amount,packageId:current.package_id,addons:oldAddons},after:{status:body.status,total:total/100,packageId,addons:addonSnapshot}})]);
  await db.query('commit'); if(googleCalendarConfigured()) after(async()=>{try{await syncGoogleCalendar(body.id);}catch{console.error('Calendar sync deferred; retry from Calendar.');}}); return Response.json({booking:saved.rows[0],calendarSync:{queued:googleCalendarConfigured(),requestedAt:new Date().toISOString()}});
 }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Could not save booking.'},{status:400});}finally{db.release();}
}
