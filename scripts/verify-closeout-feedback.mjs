import fs from 'node:fs';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('app/api/booking-consumption/route.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const prefix=`let db;export function setDb(value){db=value;}const ensureInkTracker=async()=>{};const paperSheetCount=()=>0;const requireUser=async()=>({user:{id:'admin'}});const getLocalPostgresPool=()=>({connect:async()=>db});\n`;
const module=await import('data:text/javascript;base64,'+Buffer.from(prefix+stripTypeScriptTypes(source)).toString('base64'));
const bookingId='11111111-1111-4111-8111-111111111111',itemId='22222222-2222-4222-8222-222222222222';
async function run({done=true,closed=false,stock=10,quantity=2}={}){
 const calls=[];let released=false;
 module.setDb({release(){released=true;},async query(sql,args){calls.push(sql);if(sql.includes('select id, package_id'))return {rowCount:1,rows:[{id:bookingId,package_id:'package',event_name:'QA event',event_date:'2026-11-01',status:done?'DONE':'PENDING',consumables_reconciled_at:closed?'2026-11-01':null}]};if(sql.includes('select inventory_item_id'))return {rows:[{inventory_item_id:itemId}]};if(sql.includes('select id, name, category, unit'))return {rowCount:1,rows:[{id:itemId,name:'Paper',unit:'pack',on_hand:stock,average_unit_cost:100,pcs_per_unit:10}]};if(sql.includes('sum(amount)'))return {rows:[{amount:'5500.00'}]};return {rows:[],rowCount:1};}});
 const response=await module.POST(new Request('http://localhost/api/booking-consumption',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bookingId,lines:[{inventoryItemId:itemId,quantity}],transportCost:200,operatorSalary:500,printedSheets:0})}));
 assert(released);return {response,body:await response.json(),calls};
}
const saved=await run();assert.equal(saved.response.status,200);assert.equal(saved.body.recordedReceipts,5500);assert.equal(saved.body.inventoryItemsUpdated,1);assert.equal(saved.body.unpaidCosts,700);assert.equal(saved.body.totalDirectCosts,900);assert(saved.calls.includes('commit'));assert(!saved.calls.some(sql=>sql.includes('insert into public.cash_transactions')));
const zero=await run({quantity:0});assert.equal(zero.body.inventoryItemsUpdated,0);
for(const options of [{done:false},{closed:true},{stock:1}]){const failed=await run(options);assert.equal(failed.response.status,409);assert(failed.calls.includes('rollback'));assert(!failed.calls.includes('commit'));assert.equal(failed.body.ok,undefined);}
console.log('PASS: closeout summary reflects committed receipts, inventory and unpaid costs; zero usage, duplicate closeout, incomplete event and insufficient stock checked. No database used.');
