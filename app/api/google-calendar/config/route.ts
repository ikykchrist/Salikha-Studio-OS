import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { googleCalendarConfigured } from "../../../../lib/google-calendar";
import { requireUser } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  const hostname = new URL(origin).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") throw new Error("Google Calendar setup is available only from this local app.");
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) throw new Error("Cross-origin settings updates are not allowed.");
  return origin;
}

export async function GET(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  try {
    const origin = localOrigin(request);
    return Response.json({
      configured: googleCalendarConfigured(),
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
      clientIdConfigured: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID),
      clientSecretConfigured: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_SECRET),
      redirectUri: origin + "/api/google-calendar/callback",
    });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read integration setup." }, { status: 403 }); }
}

export async function POST(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  try {
    const origin = localOrigin(request);
    const body = await request.json() as { clientId?: unknown; clientSecret?: unknown };
    const submittedClientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientId = submittedClientId || process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) return Response.json({ error: "Enter a valid Google OAuth Web client ID." }, { status: 400 });
    const previousSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
    if (!clientSecret && !previousSecret) return Response.json({ error: "Enter the Google OAuth client secret." }, { status: 400 });
    const redirectUri = origin + "/api/google-calendar/callback";
    const storedKey = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || "";
    const encryptionKey = Buffer.from(storedKey, "base64").length === 32 ? storedKey : randomBytes(32).toString("base64");
    const values: Record<string, string> = {
      GOOGLE_CALENDAR_CLIENT_ID: clientId,
      GOOGLE_CALENDAR_CLIENT_SECRET: clientSecret || previousSecret,
      GOOGLE_CALENDAR_REDIRECT_URI: redirectUri,
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: encryptionKey,
      APP_ORIGIN: origin,
    };
    const envPath = path.join(process.cwd(), ".env.local");
    const existing = await readFile(envPath, "utf8").catch(() => "");
    const keys = new Set(Object.keys(values));
    const remaining = existing.split(/\r?\n/).filter((line) => !keys.has(line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1] || ""));
    const output = remaining.filter((line, index) => line.length || index < remaining.length - 1).concat(Object.entries(values).map(([key, value]) => key + "=" + JSON.stringify(value))).join("\n") + "\n";
    await writeFile(envPath, output, { encoding: "utf8", mode: 0o600 });
    Object.assign(process.env, values);
    return Response.json({ configured: googleCalendarConfigured(), clientIdConfigured: true, clientSecretConfigured: true, redirectUri });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save Google OAuth settings." }, { status: 400 }); }
}
