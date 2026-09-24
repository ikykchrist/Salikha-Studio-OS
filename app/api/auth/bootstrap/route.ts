import { getLocalPostgresPool } from "../../../../lib/local-postgres";
import { createSession, hashPassword, publicUser, sessionCookie } from "../../../../lib/auth";
export const runtime = "nodejs";
export async function GET() { try { const r=await getLocalPostgresPool().query("select exists(select 1 from public.system_users) as has_users"); return Response.json({ needsBootstrap: !r.rows[0].has_users }); } catch { return Response.json({ error:"Local database is unavailable." },{status:503}); } }
export async function POST(request: Request) {
  let b:Record<string,unknown>; try { b=await request.json(); } catch { return Response.json({error:"Invalid request."},{status:400}); }
  const fullName=String(b.fullName||"").trim(), email=String(b.email||"").trim().toLowerCase(), username=String(b.username||"").trim().toLowerCase(), password=String(b.password||"");
  if(!fullName||!/^\S+@\S+\.\S+$/.test(email)||!/^[\w.-]{3,32}$/.test(username)||password.length<12) return Response.json({error:"Full name, valid email, username (3–32 characters), and password (12+ characters) are required."},{status:400});
  const db=getLocalPostgresPool(); const user=await db.connect(); try { await user.query("begin"); await user.query("lock table public.system_users in exclusive mode"); const count=await user.query("select count(*)::int as n from public.system_users"); if(count.rows[0].n) { await user.query("rollback"); return Response.json({error:"Initial admin already exists."},{status:409}); }
  const result=await user.query("insert into public.system_users (full_name,phone,email,facebook_url,username,password_hash,role) values ($1,$2,$3,$4,$5,$6,'ADMIN') returning id,full_name,phone,email,facebook_url,username,role,profile_photo_data",[fullName,String(b.phone||""),email,String(b.facebookUrl||""),username,await hashPassword(password)]); await user.query("commit"); const token=await createSession(result.rows[0].id); return Response.json({user:publicUser(result.rows[0])},{headers:{"set-cookie":sessionCookie(token)}});
  } catch(e) { await user.query("rollback").catch(()=>{}); return Response.json({error:e instanceof Error&&e.message.includes("unique")?"Email or username already exists.":"Could not create admin account."},{status:500}); } finally { user.release(); }
}
