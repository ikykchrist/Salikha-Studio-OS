import {requireUser} from '../../../lib/auth';
import {workflowData} from '../../../lib/workflow-data';
import {uuid} from '../../../lib/workflow-validation';
import {eventProfit} from '../../../lib/event-profit';
export const runtime='nodejs';
export async function GET(request:Request){const auth=await requireUser(request,true);if(auth.response)return auth.response;const id=new URL(request.url).searchParams.get('id');if(!uuid(id))return Response.json({error:'Choose a valid booking.'},{status:400});try{const report=eventProfit(await workflowData(),id);if(!report)return Response.json({error:'Booking not found.'},{status:404});return Response.json(report,{headers:{'cache-control':'private, no-store'}});}catch{return Response.json({error:'Could not load event profit. Please retry.'},{status:503});}}
