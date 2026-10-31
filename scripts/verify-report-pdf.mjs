import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
fs.mkdirSync('tmp/pdfs',{recursive:true});
for(const name of ['running-balance','report-pdf','financial-report']){
 const source=fs.readFileSync(`lib/${name}.ts`,'utf8').replace("'./running-balance'","'./running-balance.mjs'");
 fs.writeFileSync(`tmp/pdfs/${name}.mjs`,stripTypeScriptTypes(source));
}
const {financialReportPdf}=await import('../tmp/pdfs/report-pdf.mjs');
const {buildFinancialReport}=await import('../tmp/pdfs/financial-report.mjs');
const source={accounts:[{id:'cash',name:'Cash on hand',opening_balance:400,is_active:true}],transactions:[],bookings:[],expenses:[],movements:[],reconciliations:[]};
for(let i=0;i<95;i++)source.transactions.push({id:`posting-${i}`,account_id:'cash',account_name:'Cash on hand',transaction_date:'2026-10-31',created_at:`2026-10-31T${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}:00Z`,description:i===5?'Very long event description '.repeat(12):`Booking payment - Event ${i+1}`,amount:100,direction:'INFLOW',status:i===3?'VOIDED':'POSTED',purpose:'BOOKING_RECEIPT',reference:`receipt-${i+1}`,actor_name:'Studio admin',void_reason:i===3?'Duplicate posting':null});
source.bookings.push({id:'sample-service',event_name:'Birthday celebration',event_date:'2026-10-31',client_name:'Sample client',package_name:'Classic Photobooth',status:'DONE',total_amount:5500,paid_amount:5500,consumables_reconciled_at:'2026-10-31'});
source.expenses.push({id:'sample-cost',booking_id:'sample-service',description:'Transport and event supplies',expense_date:'2026-10-31',amount:500,status:'PAID',classification:'DIRECT',category:'Transport',accounting_treatment:'EXPENSE'});
const r=buildFinancialReport(source,'2026-10-01','2026-10-31');
for(const kind of ['cashflow','revenue']){
 const pdf=financialReportPdf(r,kind);fs.writeFileSync(`tmp/pdfs/${kind}-red-layout.pdf`,pdf);
 const s=pdf.toString();assert(s.startsWith('%PDF-1.4'));assert(s.includes('0.72 0.12 0.20'));assert(!s.includes('NaN'));
 if(kind==='cashflow'){assert(s.includes('(500.00)'));assert(s.includes('(9,800.00)'));assert((s.match(/\(Reference No\.\)/g)||[]).length>1);}
}
// Match node-postgres timestamps before JSON serialization.
const serverReport={...r,ledger:r.ledger.map(t=>({...t,created_at:new Date(t.created_at)}))};
assert(financialReportPdf(serverReport,'cashflow').includes(Buffer.from('ENDING BALANCE')));
const empty=buildFinancialReport({...source,transactions:[],bookings:[],expenses:[]},'2026-10-01','2026-10-31');
for(const kind of ['cashflow','revenue'])fs.writeFileSync(`tmp/pdfs/${kind}-empty.pdf`,financialReportPdf(empty,kind));
console.log('PDF fixture checks passed: running balances, voids, repeated headers, red theme, long descriptions, revenue and empty states.');
