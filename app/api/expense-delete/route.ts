import {requireUser} from "../../../lib/auth";
export async function POST(request:Request){const auth=await requireUser(request);if(auth.response)return auth.response;return Response.json({error:'Expense records are retained for audit. Use the reviewed void workflow.'},{status:409});}
