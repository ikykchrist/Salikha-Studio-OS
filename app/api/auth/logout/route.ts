import { expiredSessionCookie, tokenDigest } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";
export const runtime="nodejs";
export async function POST(request:Request){const token=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("salikha_session="))?.slice("salikha_session=".length);if(token)await getLocalPostgresPool().query("delete from public.system_sessions where token_hash=$1",[tokenDigest(decodeURIComponent(token))]).catch(()=>{});return Response.json({ok:true},{headers:{"set-cookie":expiredSessionCookie()}})}
