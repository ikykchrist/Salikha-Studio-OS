import { requireUser } from '../../../lib/auth';
import { workflowData } from '../../../lib/workflow-data';
import { buildFinancialReport } from '../../../lib/financial-report';
import { validDate } from '../../../lib/workflow-validation';
import { financialReportPdf } from '../../../lib/report-pdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const auth=await requireUser(request);if(auth.response)return auth.response;
  const url=new URL(request.url),from=url.searchParams.get('from'),to=url.searchParams.get('to');
  if(!validDate(from)||!validDate(to)||from>to)return Response.json({error:'Choose a valid start and end date.'},{status:400});
  try{
    const report=buildFinancialReport(await workflowData(),from,to);
    if(url.searchParams.get('format')==='pdf'){
      const kind=url.searchParams.get('kind')==='revenue'?'revenue':'cashflow';
      return new Response(new Uint8Array(financialReportPdf(report,kind)),{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="salikha-${kind}-${from}-to-${to}.pdf"`,'cache-control':'private, no-store'}});
    }
    return Response.json(report,{headers:{'cache-control':'private, no-store'}});
  }catch{return Response.json({error:'Report could not be generated. Check the database and workflow migration 018.'},{status:503});}
}
