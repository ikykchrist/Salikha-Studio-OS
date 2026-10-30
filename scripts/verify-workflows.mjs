// Integration checks use tagged fixtures only, on the localhost database.
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const connectionString=process.env.QA_DATABASE_URL;
if(!connectionString||!['localhost','127.0.0.1'].includes(new URL(connectionString).hostname))throw Error('QA_DATABASE_URL must point to localhost.');
const base=process.env.QA_ORIGIN||'http://localhost:3100';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('QA_ORIGIN must be localhost.');
const pool=new pg.Pool({connectionString});const run=randomUUID();const actor=randomUUID(),clientId=randomUUID(),bookingId=randomUUID(),accountId=randomUUID(),toId=randomUUID(),itemId=randomUUID(),packageId=randomUUID();
const token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
const headers={'content-type':'application/json',cookie:`salikha_session=${token}`};let checks=0;
async function request(path,body,expected=200){const res=await fetch(base+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});const result=await res.json();assert.equal(res.status,expected,JSON.stringify(result));checks++;return result;}
const money=(action,fields={})=>request('/api/money',{requestId:randomUUID(),action,date:'2026-01-15',accountId,...fields});
try{
 await pool.query("insert into public.system_users(id,full_name,email,username,password_hash,role) values($1,'Workflow QA',$2,$3,'not-a-login-password','ADMIN')",[actor,`qa-${run}@example.invalid`,`qa-${run}`]);
 await pool.query("insert into public.system_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')",[digest,actor]);
 await pool.query("insert into public.clients(id,display_name) values($1,$2)",[clientId,`[QA ${run}] Client`]);
 await pool.query("insert into public.cash_accounts(id,name,opening_balance) values($1,$2,1000),($3,$4,0)",[accountId,`[QA ${run}] Cash`,toId,`[QA ${run}] Bank`]);
 await pool.query("insert into public.inventory_items(id,name,category,unit,on_hand,average_unit_cost) values($1,$2,'Supplies','piece',0,0)",[itemId,`[QA ${run}] Paper`]);
 await pool.query("insert into public.service_packages(id,name) values($1,$2)",[packageId,`[QA ${run}] Package`]);
 await pool.query('insert into public.package_recipes(package_id,inventory_item_id,quantity) values($1,$2,2)',[packageId,itemId]);
 await request('/api/bookings',{id:bookingId,clientId,packageId,eventName:'QA event',date:'2026-01-15',total:1000,startTime:'10:00',endTime:'12:00'});
 await request('/api/bookings',{id:bookingId,clientId,packageId,eventName:'QA event',date:'2026-01-15',total:1000});
 const edit={id:bookingId,eventName:'QA event',date:'2026-01-15',startTime:'10:00',endTime:'12:00',total:1000,status:'DONE'};
 await request('/api/booking-update',edit,400); // no fabricated full payment
 const receipt={requestId:randomUUID(),action:'RECEIPT',date:'2026-01-15',accountId,bookingId,amount:1000};
 await Promise.all([request('/api/money',receipt),request('/api/money',receipt)]); // concurrency retry posts once
 assert.equal((await pool.query('select paid_amount from public.bookings where id=$1',[bookingId])).rows[0].paid_amount,'1000.00');checks++;
 await request('/api/money',{...receipt,requestId:randomUUID(),amount:1},400); // cannot overcollect
 await request('/api/booking-update',edit);
 const stock={requestId:randomUUID(),itemId,type:'STOCK_IN',quantity:10,unitCost:100,notes:'QA purchase',date:'2026-01-15',paymentStatus:'PAID',accountId};
 await request('/api/inventory-stock',stock);await request('/api/inventory-stock',stock);
 await request('/api/booking-consumption',{bookingId,lines:[{inventoryItemId:itemId,quantity:2}],transportCost:50,operatorSalary:0});
 await request('/api/booking-consumption',{bookingId,lines:[{inventoryItemId:itemId,quantity:2}]},409);
 const usage=(await pool.query("select id from public.inventory_movements where inventory_item_id=$1 and movement_type='USAGE'",[itemId])).rows[0];
 const returned={requestId:randomUUID(),itemId,type:'RETURN',sourceUsageId:usage.id,quantity:1,notes:'QA unused return',date:'2026-01-16'};
 await request('/api/inventory-stock',returned);await request('/api/inventory-stock',returned);
 await request('/api/inventory-stock',{...returned,requestId:randomUUID(),quantity:2},400);
 await request('/api/inventory-stock',{...returned,requestId:randomUUID(),type:'USAGE',quantity:1000},400);
 assert.equal(Number((await pool.query('select on_hand from public.inventory_items where id=$1',[itemId])).rows[0].on_hand),9);checks++;
 const unpaid=(await pool.query("select id from public.expenses where booking_id=$1 and status='PENDING'",[bookingId])).rows[0];
 await money('PAY_EXPENSE',{expenseId:unpaid.id});await request('/api/money',{requestId:randomUUID(),action:'PAY_EXPENSE',date:'2026-01-15',accountId,expenseId:unpaid.id},400);
 await money('EXPENSE',{description:`[QA ${run}] Rent`,amount:100,classification:'OPERATING',category:'Rent',paid:true});
 await money('TRANSFER',{toAccountId:toId,amount:200});await money('OWNER_CAPITAL',{description:'QA capital',amount:1000});await money('LOAN_RECEIVED',{description:'QA loan',amount:1000});
 await request('/api/local-db',{table:'cash_transactions',operation:'update',filters:[{column:'account_id',value:accountId}],payload:{amount:1}},409);
 const report=await request('/api/reports?from=2026-01-01&to=2026-01-31');
 assert.equal(report.revenue,1000);assert.equal(report.directCosts,150);assert.equal(report.operatingCosts,100);assert.equal(report.operatingProfit,750);assert.equal(report.closing,2850);checks+=5;
 const invalid=await request('/api/reports?from=2026-02-30&to=2026-03-01',null,400);assert.ok(invalid.error);
 const activity=randomUUID();await request('/api/client-activities',{id:activity,clientId,kind:'FOLLOW_UP',summary:'QA follow-up',dueDate:'2026-01-20'});await request('/api/client-activities',{id:activity,action:'COMPLETE'});
 const pdf=await fetch(base+'/api/reports?from=2026-01-01&to=2026-01-31&format=pdf&kind=revenue',{headers});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/pdf/);await mkdir('tmp/pdfs',{recursive:true});await writeFile('tmp/pdfs/revenue-qa.pdf',Buffer.from(await pdf.arrayBuffer()));
 const cashPdf=await fetch(base+'/api/reports?from=2026-01-01&to=2026-01-31&format=pdf&kind=cashflow',{headers});await writeFile('tmp/pdfs/cashflow-qa.pdf',Buffer.from(await cashPdf.arrayBuffer()));checks+=2;
 console.log(`PASS: ${checks} workflow assertions. Revenue 1000, direct costs 150, operating costs 100, operating profit 750, closing cash 2850. PDFs generated for visual QA.`);
}finally{
 // Remove only this run's tagged fixtures, never existing local records.
 await pool.query('begin');
 await pool.query('delete from public.audit_logs where actor_id=$1',[actor]);
 await pool.query('delete from public.client_activities where client_id=$1',[clientId]);
 await pool.query('delete from public.inventory_movements where inventory_item_id=$1',[itemId]);
 await pool.query('delete from public.booking_consumable_usage where booking_id=$1',[bookingId]);
 await pool.query('delete from public.cash_transactions where account_id=any($1::uuid[])',[ [accountId,toId] ]);
 await pool.query('delete from public.payments where booking_id=$1',[bookingId]);
 await pool.query('delete from public.expenses where booking_id=$1 or created_by=$2',[bookingId,actor]);
 await pool.query('delete from public.bookings where id=$1',[bookingId]);
 await pool.query('delete from public.package_recipes where package_id=$1',[packageId]);
 await pool.query('delete from public.service_packages where id=$1',[packageId]);
 await pool.query('delete from public.inventory_items where id=$1',[itemId]);
 await pool.query('delete from public.cash_accounts where id=any($1::uuid[])',[[accountId,toId]]);
 await pool.query('delete from public.clients where id=$1',[clientId]);
 await pool.query('delete from public.system_sessions where user_id=$1',[actor]);await pool.query('delete from public.system_users where id=$1',[actor]);
 await pool.query('commit');await pool.end();
}
