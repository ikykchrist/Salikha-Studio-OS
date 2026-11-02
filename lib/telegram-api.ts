import "server-only";
import { createHmac } from "node:crypto";
import { getLocalPostgresPool } from "./local-postgres";
import { decryptGoogleToken } from "./google-calendar";

export async function getTelegramToken() {
  if(process.env.TELEGRAM_BOT_TOKEN)return process.env.TELEGRAM_BOT_TOKEN;
  const {rows}=await getLocalPostgresPool().query("select encrypted_token from public.telegram_bot_config where id=true");
  return rows[0]?.encrypted_token ? decryptGoogleToken(rows[0].encrypted_token as string) : "";
}
export async function telegramWebhookSecret() {
  const token=await getTelegramToken();
  if(!token)return "";
  return createHmac("sha256",token).update("salikha-booking-webhook-v1").digest("base64url");
}

export async function telegramApi(method: string, payload: Record<string, unknown>, tokenOverride?:string) {
  const token = tokenOverride || await getTelegramToken();
  if (!token || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("Telegram bot token is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null) as { ok?: boolean; result?: unknown } | null;
  if (!response.ok || !data?.ok) throw new Error(`Telegram ${method} failed (${response.status}).`);
  return data.result;
}

export const sendTelegramMessage = (chatId: number, text: string, buttons?: Array<Array<{text:string;callback_data:string}>>) => telegramApi("sendMessage", {
  chat_id: chatId, text, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
});
