import { getSessionUser, publicUser } from "../../../../lib/auth";
export const runtime="nodejs";
export async function GET(request:Request){try{const user=await getSessionUser(request);return Response.json({user:user?publicUser(user):null})}catch{return Response.json({error:"Local database is unavailable."},{status:503})}}
