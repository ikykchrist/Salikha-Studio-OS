import { requireUser } from "../../../../lib/auth";
import { getLocalPostgresPool } from "../../../../lib/local-postgres";
import { uuid } from "../../../../lib/workflow-validation";

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request) {
  const auth = await requireUser(request, true);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!uuid(id)) return new Response(null, { status: 400, headers });
  try {
    const { rows } = await getLocalPostgresPool().query<{ profile_photo: Buffer | null }>(
      "select profile_photo from public.staff_members where id = $1", [id],
    );
    const photo = rows[0]?.profile_photo;
    if (!photo) return new Response(null, { status: 404, headers });
    return new Response(Uint8Array.from(photo), { headers: { ...headers, "content-type": "image/jpeg" } });
  } catch (error) {
    console.error("Staff photo load failed", { code: (error as { code?: string })?.code });
    return new Response(null, { status: 503, headers });
  }
}
