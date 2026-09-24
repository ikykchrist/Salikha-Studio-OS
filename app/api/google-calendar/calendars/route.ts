import { googleApi } from "../../../../lib/google-calendar";
import { requireUser } from "../../../../lib/auth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireUser(request, true); if (auth.response) return auth.response;
  try {
    const result = await googleApi("/users/me/calendarList?minAccessRole=writer&maxResults=250") as { items?: Array<{ id: string; summary?: string; primary?: boolean; accessRole?: string }> };
    return Response.json({ calendars: (result.items || []).filter((item) => item.accessRole === "writer" || item.accessRole === "owner").map(({ id, summary, primary }) => ({ id, name: summary || id, primary: Boolean(primary) })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load calendars." }, { status: 502 }); }
}
