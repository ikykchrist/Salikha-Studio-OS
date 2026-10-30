import {requireUser} from "../../../lib/auth";
export async function POST(request:Request){const auth=await requireUser(request);if(auth.response)return auth.response;return Response.json({error:'Use Expenses → Pay expense to record the actual payment date and account.'},{status:409});}
