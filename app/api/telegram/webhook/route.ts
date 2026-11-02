import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";
import { ensureTelegramSchema } from "../../../../lib/ensure-telegram-schema";
import { ensureBookingTbaSchema } from "../../../../lib/ensure-booking-tba-schema";
import { googleCalendarConfigured, syncGoogleCalendar } from "../../../../lib/google-calendar";
import { missingTelegramFields, parseTelegramBooking, telegramDraftPreview, type TelegramBookingDraft } from "../../../../lib/telegram-booking";
import { sendTelegramMessage, telegramApi, telegramWebhookSecret } from "../../../../lib/telegram-api";
import { validBookingSchedule } from "../../../../lib/booking-schedule";
import { extractTelegramBooking } from "../../../../lib/telegram-gemini";

export const runtime = "nodejs";
export const maxDuration = 60;
type TelegramUpdate = { update_id?: number; message?: { text?: string; from?: { id: number }; chat?: { id: number; type: string } }; callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number; type: string } } } };
const equal = (a: string, b: string) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
const allowed = async (id: number) => {
  const result=await getLocalPostgresPool().query("select 1 from public.telegram_allowed_users where telegram_user_id=$1",[id]);
  return Boolean(result.rowCount);
};
const buttons = (id: string, ready: boolean) => ready ? [[{text:"✅ Confirm booking",callback_data:`confirm:${id}`},{text:"Cancel",callback_data:`cancel:${id}`}]] : [[{text:"Cancel draft",callback_data:`cancel:${id}`}]];
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function latestDraft(userId: number) {
  const { rows } = await getLocalPostgresPool().query("select id, parsed from public.telegram_booking_drafts where telegram_user_id=$1 and status='DRAFT' order by created_at desc limit 1",[userId]);
  return rows[0] as {id:string;parsed:TelegramBookingDraft}|undefined;
}
async function preview(chatId:number,id:string,draft:TelegramBookingDraft) {
  const missing=missingTelegramFields(draft);
  await sendTelegramMessage(chatId,telegramDraftPreview(draft)+(missing.length?`\n\nRequired before confirmation: ${missing.join(", ")}`:""),buttons(id,missing.length===0));
}
async function editDraft(chatId:number,userId:number,text:string) {
  const current=await latestDraft(userId);
  if(!current){await sendTelegramMessage(chatId,"No open draft. Paste a client booking form first.");return;}
  const draft={...current.parsed};
  const client=text.match(/^\/?client\s+([\s\S]+)$/i);
  const edit=text.match(/^\/?edit\s+(client|event|date|time|venue|package|price|phone|balance|theme|guests)\s+([\s\S]+)$/i);
  if(client) draft.clientName=client[1].trim();
  else if(edit){
    const value=edit[2].trim();
    const parsed=parseTelegramBooking(`${edit[1]}: ${value}`);
    switch(edit[1].toLowerCase()){
      case "client": draft.clientName=value; break;
      case "event": draft.eventName=value; break;
      case "date": draft.date=value.toUpperCase()==="TBA"?"":parsed.date; if(value.toUpperCase()!=="TBA"&&!draft.date)throw Error("Use a date like October 8, 2026 or 2026-10-08."); break;
      case "time": draft.startTime=value.toUpperCase()==="TBA"?"":parsed.startTime; draft.endTime=value.toUpperCase()==="TBA"?"":parsed.endTime; if(value.toUpperCase()!=="TBA"&&(!draft.startTime||!draft.endTime))throw Error("Use a time like 3pm to 5pm."); break;
      case "venue": draft.venue=value; break;
      case "package": draft.packageName=value; break;
      case "price": draft.total=Number(value.replace(/[₱,\s]/g,"")); if(!Number.isFinite(draft.total)||draft.total<0)throw Error("Use a price like 5500."); break;
      case "phone": draft.phone=value; break;
      case "balance": draft.statedBalance=parsed.statedBalance; if(draft.statedBalance===null)throw Error("Use a balance like 5000."); break;
      case "theme": draft.theme=value; break;
      case "guests": draft.guestCount=value; break;
    }
  }else{await sendTelegramMessage(chatId,"Use `client Maria Santos` or `edit date 2026-10-08`, `edit time 3pm to 5pm`, `edit price 5500`. Send `edit date TBA` to clear a date.");return;}
  await getLocalPostgresPool().query("update public.telegram_booking_drafts set parsed=$2::jsonb,updated_at=now() where id=$1::uuid and telegram_user_id=$3 and status='DRAFT'",[current.id,JSON.stringify(draft),userId]);
  await preview(chatId,current.id,draft);
}
async function confirmDraft(chatId:number,userId:number,id:string,override:boolean) {
  const db=await getLocalPostgresPool().connect();
  let bookingId:string|undefined;
  try{
    await db.query("begin");
    await ensureBookingTbaSchema(db);
    const {rows}=await db.query("select * from public.telegram_booking_drafts where id=$1::uuid and telegram_user_id=$2 and chat_id=$3 for update",[id,userId,chatId]);
    const row=rows[0];
    if(!row){await db.query("rollback");return "Draft not found for this chat.";}
    if(row.status==='CONFIRMED'){await db.query("rollback");return "This booking is already saved in Salikha.";}
    if(row.status!=='DRAFT'){await db.query("rollback");return "This draft was cancelled.";}
    const draft=row.parsed as TelegramBookingDraft;
    const missing=missingTelegramFields(draft);
    if(missing.length){await db.query("rollback");return `Still missing: ${missing.join(", ")}. Edit the draft first.`;}
    if(!validBookingSchedule(draft.date,draft.startTime,draft.endTime) || draft.total===null || draft.total<0 || !Number.isFinite(draft.total)) {await db.query("rollback");return "The date, time, or price is invalid. Edit the draft first.";}
    const clients=await db.query("select id from public.clients where lower(trim(display_name))=lower($1) order by created_at limit 2",[draft.clientName]);
    if(clients.rowCount && clients.rowCount>1){await db.query("rollback");return "Several clients have that exact name. Resolve the duplicate in Clients before confirming.";}
    const existing=await db.query("select id,event_name from public.bookings where lower(trim(event_name))=lower($1) and event_date is not distinct from nullif($2,'')::date and status not in ('CANCELLED','ARCHIVED') limit 1",[draft.eventName,draft.date]);
    const overlap=draft.date&&draft.startTime&&draft.endTime?await db.query("select id,event_name from public.bookings where event_date=$1::date and start_time<$3::time and end_time>$2::time and status not in ('CANCELLED','ARCHIVED') limit 1",[draft.date,draft.startTime,draft.endTime]):{rows:[]};
    if(!override&&(existing.rows[0]||overlap.rows[0])){await db.query("rollback");const other=existing.rows[0]||overlap.rows[0];return {text:`⚠️ Possible ${existing.rows[0]?"duplicate booking":"schedule overlap"}: ${other.event_name}. Review before saving.`,buttons:[[{text:"Save anyway",callback_data:`override:${id}`},{text:"Cancel",callback_data:`cancel:${id}`}]]};}
    const clientId=clients.rows[0]?.id||(await db.query("insert into public.clients(display_name,phone) values($1,$2) returning id",[draft.clientName,draft.phone||null])).rows[0].id;
    const packageRow=draft.packageName?(await db.query("select id,name from public.service_packages where lower(trim(name))=lower($1) and is_active=true limit 1",[draft.packageName])).rows[0]:null;
    const notes=["Telegram booking intake",draft.packageName&&!packageRow?`Requested package: ${draft.packageName} (not matched to catalog)`:"",draft.celebrant?`Celebrant: ${draft.celebrant}`:"",draft.theme?`Design theme: ${draft.theme}`:"",draft.guestCount?`Estimated guests: ${draft.guestCount}`:"",draft.celebrantPhoto?`Celebrant photo: ${draft.celebrantPhoto}`:"",draft.statedBalance!==null?`Client-stated balance: ₱${draft.statedBalance.toFixed(2)}; payment not verified or posted.`:""].filter(Boolean).join("\n");
    const saved=await db.query("insert into public.bookings(client_id,package_id,event_name,event_date,start_time,end_time,venue,total_amount,notes) values($1,$2,$3,nullif($4,'')::date,nullif($5,'')::time,nullif($6,'')::time,$7,$8,$9) returning id",[clientId,packageRow?.id||null,draft.eventName,draft.date,draft.startTime,draft.endTime,draft.venue||null,draft.total,notes]);
    bookingId=saved.rows[0].id;
    await db.query("update public.telegram_booking_drafts set status='CONFIRMED',booking_id=$2::uuid,updated_at=now() where id=$1::uuid",[id,bookingId]);
    await db.query("insert into public.audit_logs(action,entity_type,entity_id,metadata) values('BOOKING_CREATE_TELEGRAM','bookings',$1::uuid,$2::jsonb)",[bookingId,JSON.stringify({telegramUserId:userId,chatId,draftId:id,duplicateOverride:override,packageMatched:Boolean(packageRow),statedBalance:draft.statedBalance,paymentPosted:false})]);
    await db.query("commit");
  }catch(error){await db.query("rollback").catch(()=>undefined);throw error;}finally{db.release();}
  if(bookingId&&googleCalendarConfigured()) after(async()=>{try{await syncGoogleCalendar(bookingId);}catch{console.error("Telegram booking Calendar sync deferred.");}});
  return `✅ Booking saved in Salikha. ${draftStatus(bookingId)}\nNo payment was posted. Record any verified downpayment in Cashflow.`;
}
const draftStatus=(id?:string)=>id?`Reference: ${id}`:"";

export async function POST(request:Request){
  const secret=await telegramWebhookSecret().catch(()=>"");
  const incoming=request.headers.get("x-telegram-bot-api-secret-token")||"";
  if(!secret||!equal(secret,incoming))return new Response(null,{status:403});
  const raw=await request.text();
  if(raw.length>16000)return new Response(null,{status:413});
  let update:TelegramUpdate;
  try{update=JSON.parse(raw);}catch{return new Response(null,{status:400});}
  const message=update.message;
  const callback=update.callback_query;
  const userId=message?.from?.id??callback?.from.id;
  const chat=message?.chat??callback?.message?.chat;
  if(!userId||!chat||chat.type!=="private")return Response.json({ok:true});
  try{
    if(message?.text?.trim()==="/id"){await sendTelegramMessage(chat.id,`Your Telegram user ID: ${userId}. Share this ID with your Salikha admin to allow booking entry.`);return Response.json({ok:true});}
    const db=await getLocalPostgresPool().connect();
    try{await ensureTelegramSchema(db);}finally{db.release();}
    if(!await allowed(userId)){await sendTelegramMessage(chat.id,"This Telegram account is not approved for Salikha booking entry. Send /id and ask your admin to add that ID.");return Response.json({ok:true});}
    if(callback){
      await telegramApi("answerCallbackQuery",{callback_query_id:callback.id});
      const [action,id]=String(callback.data||"").split(":");
      if(!uuid(id)){await sendTelegramMessage(chat.id,"Invalid draft action.");return Response.json({ok:true});}
      if(action==="cancel"){
        await getLocalPostgresPool().query("update public.telegram_booking_drafts set status='CANCELLED',updated_at=now() where id=$1::uuid and telegram_user_id=$2 and chat_id=$3 and status='DRAFT'",[id,userId,chat.id]);
        await sendTelegramMessage(chat.id,"Draft cancelled. No booking was saved.");
      }else if(action==="confirm"||action==="override"){
        const result=await confirmDraft(chat.id,userId,id,action==="override");
        if(typeof result==="string")await sendTelegramMessage(chat.id,result);
        else await sendTelegramMessage(chat.id,result.text,result.buttons);
      }
      return Response.json({ok:true});
    }
    const text=message?.text?.trim()||"";
    if(text==="/start"||text==="/help"){await sendTelegramMessage(chat.id,"Paste the client booking form here. I’ll extract a draft for your review. Add `Client Name: ...` to the form, or send `client <name>` after the preview. Nothing saves until you tap Confirm. Payments are never posted automatically.");return Response.json({ok:true});}
    if(!text)return Response.json({ok:true});
    if(/^\/?(?:client|edit)\s+/i.test(text)){await editDraft(chat.id,userId,text);return Response.json({ok:true});}
    if(text.length>5000){await sendTelegramMessage(chat.id,"Booking text is too long. Send at most 5,000 characters.");return Response.json({ok:true});}
    const parsed=await extractTelegramBooking(text);
    if(!parsed.eventName&&!parsed.packageName){await sendTelegramMessage(chat.id,"I couldn’t identify a booking form. Include `Name of the event:` and a package/price line, then resend.");return Response.json({ok:true});}
    const saved=await getLocalPostgresPool().query("insert into public.telegram_booking_drafts(source_update_id,telegram_user_id,chat_id,source_text,parsed) values($1,$2,$3,$4,$5::jsonb) on conflict(source_update_id) do update set source_update_id=excluded.source_update_id returning id,parsed",[update.update_id,userId,chat.id,text,JSON.stringify(parsed)]);
    await preview(chat.id,saved.rows[0].id,saved.rows[0].parsed);
    return Response.json({ok:true});
  }catch(error){
    const message=error instanceof Error?error.message:"Booking intake failed.";
    await sendTelegramMessage(chat.id,`Could not finish this action: ${message.slice(0,220)}. Please retry or use the Salikha app.`).catch(()=>undefined);
    return Response.json({ok:false},{status:500});
  }
}
