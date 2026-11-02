import { requireUser } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";
import { ensureTelegramSchema } from "../../../../lib/ensure-telegram-schema";
import { getTelegramToken, telegramApi, telegramWebhookSecret } from "../../../../lib/telegram-api";
import { encryptGoogleToken } from "../../../../lib/google-calendar";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});

export async function GET(request:Request){
  const auth=await requireUser(request,true);if(auth.response)return auth.response;
  const db=await getLocalPostgresPool().connect();
  let users:Array<{id:string}>=[];
  try{
    await ensureTelegramSchema(db);
    users=(await db.query("select telegram_user_id::text as id from public.telegram_allowed_users order by approved_at desc")).rows;
  }catch{return reply({configured:false,webhookActive:false,error:"Could not check Telegram setup.",users:[]},503);}finally{db.release();}
  try{
    const configured=Boolean(await getTelegramToken());
    if(!configured)return reply({configured:false,webhookActive:false,users});
    const [me,webhook]=await Promise.all([telegramApi("getMe",{}) as Promise<{username?:string}>,telegramApi("getWebhookInfo",{}) as Promise<{url?:string;last_error_message?:string}>]);
    return reply({configured:true,botUsername:me.username||"",webhookActive:Boolean(webhook.url?.endsWith("/api/telegram/webhook")),webhookUrl:webhook.url||"",webhookError:webhook.last_error_message||"",users});
  }catch{return reply({configured:false,webhookActive:false,error:"Could not check Telegram setup.",users},503);}
}
export async function POST(request:Request){
  if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Request origin is not allowed."},403);
  const auth=await requireUser(request,true);if(auth.response)return auth.response;
  const body=await request.json().catch(()=>null);
  if(!body||!['saveToken','activate','approve','revoke'].includes(body.action))return reply({error:"Choose an action."},400);
  if(body.action==='saveToken'){
    const token=String(body.token||"").trim();
    if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))return reply({error:"Paste a valid BotFather token."},400);
    try{
      const me=await telegramApi("getMe",{},token) as {username?:string};
      if(me.username?.toLowerCase()!=="salikhabookingsbot")return reply({error:"This token does not belong to @SalikhaBookingsBot."},400);
      const db=await getLocalPostgresPool().connect();
      try{
        await ensureTelegramSchema(db);
        await db.query("insert into public.telegram_bot_config(id,encrypted_token,bot_username) values(true,$1,$2) on conflict(id) do update set encrypted_token=excluded.encrypted_token,bot_username=excluded.bot_username,updated_at=now()",[encryptGoogleToken(token),me.username]);
        await db.query("insert into public.audit_logs(actor_id,action,entity_type,metadata) values($1::uuid,'TELEGRAM_BOT_CONNECT','telegram_bot_config',$2::jsonb)",[auth.user!.id,JSON.stringify({botUsername:me.username})]);
      }finally{db.release();}
      return reply({ok:true,botUsername:me.username});
    }catch{return reply({error:"Could not verify or save the bot token. Check the token and server encryption key."},502);}
  }
  if(body.action==='activate'){
    if(!await getTelegramToken())return reply({error:"Connect the BotFather token first."},503);
    const origin=process.env.APP_ORIGIN||new URL(request.url).origin;
    if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))return reply({error:"The public app origin must use HTTPS."},400);
    try{
      const me=await telegramApi("getMe",{}) as {username?:string};
      if(me.username?.toLowerCase()!=="salikhabookingsbot")return reply({error:"The configured token belongs to a different bot."},400);
      await telegramApi("setWebhook",{url:`${origin.replace(/\/$/,"")}/api/telegram/webhook`,secret_token:await telegramWebhookSecret(),allowed_updates:["message","callback_query"],drop_pending_updates:false});
      return reply({ok:true,botUsername:me.username});
    }catch{return reply({error:"Could not activate Telegram webhook. Check the token and app origin."},502);}
  }
  const id=String(body.telegramUserId||"").trim();
  if(!/^\d{5,20}$/.test(id))return reply({error:"Enter the numeric Telegram ID shown by /id."},400);
  const db=await getLocalPostgresPool().connect();
  try{
    await ensureTelegramSchema(db);
    if(body.action==='revoke')await db.query("delete from public.telegram_allowed_users where telegram_user_id=$1",[id]);
    else await db.query("insert into public.telegram_allowed_users(telegram_user_id,approved_by) values($1,$2::uuid) on conflict(telegram_user_id) do update set approved_by=excluded.approved_by,approved_at=now()",[id,auth.user!.id]);
    await db.query("insert into public.audit_logs(actor_id,action,entity_type,metadata) values($1::uuid,$2,'telegram_allowed_users',$3::jsonb)",[auth.user!.id,body.action==='revoke'?'TELEGRAM_STAFF_REVOKE':'TELEGRAM_STAFF_APPROVE',JSON.stringify({telegramUserId:id})]);
    return reply({ok:true});
  }catch{return reply({error:"Could not approve this Telegram user ID."},500);}finally{db.release();}
}
