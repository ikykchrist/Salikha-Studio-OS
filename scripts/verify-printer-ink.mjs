import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(fs.readFileSync('lib/printer-ink.ts','utf8'));
const {validateInkUpdate,refillValue,inkColors}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const base={printerNo:1,color:'C',action:'REFILL',level:90,addedMl:35,bottleMl:70,bottlePrice:130,notes:'Measured refill after event'};
assert.equal(inkColors.length,6);assert.equal(refillValue(70,70,130),130);assert.equal(refillValue(35,70,130),65);assert.equal(refillValue(1,70,130),1.86);assert.equal(validateInkUpdate(base).printerNo,1);assert.equal(validateInkUpdate({...base,printerNo:2}).printerNo,2);
for(const invalid of [{printerNo:3},{color:'RED'},{level:101},{level:-1},{level:''},{addedMl:0},{addedMl:-1},{addedMl:Infinity},{bottleMl:0},{bottlePrice:-1},{notes:''},{addedMl:'1.1234'}])assert.throws(()=>validateInkUpdate({...base,...invalid}));
assert.equal(validateInkUpdate({...base,action:'LEVEL',addedMl:''}).addedMl,null);
// Exercise the transactional handler with a fake database; no live writes.
let calls=[],prior=null,percent=20;
const routeSource=fs.readFileSync('app/api/printer-ink/route.ts','utf8').replace(/^import .*;\r?\n/gm,'');
const prelude=`const requireUser=async()=>({user:{id:'operator'}});const ensureInkTracker=async()=>{};const uuid=v=>typeof v==='string'&&v.length===36;let database;export const setDatabase=db=>database=db;const getLocalPostgresPool=()=>({connect:async()=>database});`;
const route=await import('data:text/javascript;base64,'+Buffer.from(prelude+code+'\n'+stripTypeScriptTypes(routeSource)).toString('base64'));
async function post(values){calls=[];let released=false;route.setDatabase({release(){released=true;},async query(sql,args){calls.push(sql);if(sql.startsWith('select * from public.printer_ink_history'))return {rowCount:prior?1:0,rows:prior?[prior]:[]};if(sql.includes('for update'))return {rows:[{level_percent:percent}]};return {rows:[],rowCount:1};}});const r=await route.POST(new Request('http://localhost/api/printer-ink',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...base,requestId:'11111111-1111-4111-8111-111111111111',...values})}));assert(released);return {r,data:await r.json()};}
let saved=await post({});assert.equal(saved.r.status,200);assert.equal(saved.data.referenceValue,65);assert(calls.includes('commit'));assert(!calls.some(s=>s.includes('cash_transactions')||s.includes('public.expenses')||s.includes('update public.inventory_items')));
let lower=await post({level:10});assert.equal(lower.r.status,400);assert(calls.includes('rollback'));assert(!calls.includes('commit'));
let check=await post({level:10,action:'LEVEL'});assert.equal(check.r.status,200);
prior={printer_no:1,color:'C',created_by:'operator',action:'REFILL',after_percent:90,bottle_ml:70,bottle_price:130,notes:base.notes,added_ml:35};assert.equal((await post({})).data.alreadySaved,true);assert.equal((await post({addedMl:70})).r.status,400);
console.log('PASS: six colors, two printers, refill values, validations, transaction commit/rollback, no financial/stock mutations and duplicate-request protection. No database used.');
