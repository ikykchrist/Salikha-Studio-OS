import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getLocalPostgresPool } from "./local-postgres";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "salikha_session";
export type SystemUser = { id: string; full_name: string; phone: string; email: string; facebook_url: string; username: string; role: "ADMIN" | "USER"; profile_photo_data: string | null };
export const hashPassword = async (password: string) => { const salt = randomBytes(16).toString("hex"); const key = await scrypt(password, salt, 64) as Buffer; return `${salt}:${key.toString("hex")}`; };
export const verifyPassword = async (password: string, stored: string) => { const [salt, key] = stored.split(":"); if (!salt || !key) return false; const actual = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(key, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); };
export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function createSession(userId: string) { const token = randomBytes(32).toString("base64url"); await getLocalPostgresPool().query("insert into public.system_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '14 days')", [tokenDigest(token), userId]); return token; }
export async function getSessionUser(request: Request): Promise<SystemUser | null> {
  const token = request.headers.get("cookie")?.split(";").map((x) => x.trim()).find((x) => x.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const result = await getLocalPostgresPool().query("select u.id,u.full_name,u.phone,u.email,u.facebook_url,u.username,u.role,u.profile_photo_data from public.system_sessions s join public.system_users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.is_active", [tokenDigest(decodeURIComponent(token))]);
  return (result.rows[0] as SystemUser | undefined) ?? null;
}
export async function requireUser(request: Request, adminOnly = false) { const user = await getSessionUser(request); if (!user) return { user: null, response: Response.json({ error: "Sign in required." }, { status: 401 }) }; if (adminOnly && user.role !== "ADMIN") return { user: null, response: Response.json({ error: "Admin access required." }, { status: 403 }) }; return { user, response: null }; }
export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const expiredSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const publicUser = (user: SystemUser) => ({ id:user.id, fullName:user.full_name, phone:user.phone, email:user.email, facebookUrl:user.facebook_url, username:user.username, role:user.role, profilePhoto:user.profile_photo_data });
