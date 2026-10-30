import {requireUser} from "../../../lib/auth";
export async function POST(request:Request){const auth=await requireUser(request);if(auth.response)return auth.response;return Response.json({error:'Cash history cannot be cleared. Void incorrect postings with a reason instead.'},{status:409});}
