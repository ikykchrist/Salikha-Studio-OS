import assert from 'node:assert/strict';
import {combinedRunningBalances} from '../lib/running-balance.ts';
const account=(id,opening_balance,is_active=true)=>({id,name:id,opening_balance,is_active});
const row=(id,amount,direction,extra={})=>({id,amount,direction,account_id:'cash',transaction_date:'2026-10-31',created_at:'2026-10-31T10:00:00Z',status:'POSTED',purpose:'BOOKING_RECEIPT',reference:null,...extra});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const accounts=[account('cash',300),account('bank',100)];
const history=[row('in',100,'INFLOW'),row('out',50,'OUTFLOW',{account_id:'bank',created_at:'2026-10-31T11:00:00Z'}),row('void',999,'INFLOW',{status:'VOIDED',created_at:'2026-10-31T12:00:00Z'})];
const balances=combinedRunningBalances(accounts,history);
eq(balances.get('in'),500);eq(balances.get('out'),450);eq(balances.get('void'),450);
eq(combinedRunningBalances(accounts,[...history].reverse()).get('out'),450);
const transfer=[row('out-leg',200,'OUTFLOW',{purpose:'TRANSFER',reference:'workflow:transfer:out'}),row('in-leg',200,'INFLOW',{purpose:'TRANSFER',reference:'workflow:transfer:in',account_id:'bank'})];
eq([...combinedRunningBalances(accounts,transfer).values()],[400,400]);
eq(combinedRunningBalances(accounts,[transfer[0]]).get('out-leg'),200); // Incomplete historical postings still affect the book balance.
eq(combinedRunningBalances([account('cash',400),account('inactive',20,false)],[row('new',100,'INFLOW')]).get('new'),520);
eq(combinedRunningBalances([account('cash','0.10')],[row('cents','0.20','INFLOW')]).get('cents'),0.30);
eq(combinedRunningBalances(accounts,[row('negative',500,'OUTFLOW')]).get('negative'),-100);
const backdated=[row('later',100,'INFLOW',{transaction_date:'2026-11-01'}),row('earlier',50,'OUTFLOW',{transaction_date:'2026-10-30'})];
const dated=combinedRunningBalances(accounts,backdated);eq(dated.get('earlier'),350);eq(dated.get('later'),450);
// A filtered row keeps the full-history total, not a per-account or per-period subtotal.
eq(history.filter(t=>t.account_id==='bank').map(t=>balances.get(t.id)),[450]);
const ties=[row('z-first',100,'INFLOW'),row('a-second',10,'OUTFLOW')];eq([...combinedRunningBalances(accounts,ties).values()],[500,490]);
console.log(`PASS: ${checks} running-balance checks. No database writes.`);
