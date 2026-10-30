import { requireUser } from '../../../lib/auth';
import { getLocalPostgresPool } from '../../../lib/local-postgres';
import { workflowData } from '../../../lib/workflow-data';
import { cents, uuid, validDate } from '../../../lib/workflow-validation';
import {createHash} from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth=await requireUser(request); if(auth.response)return auth.response;
  try{return Response.json(await workflowData());}catch{return Response.json({error:'Could not load money records. Check database connectivity and migration 018.'},{status:503});}
}
export async function POST(request: Request) {
  const auth=await requireUser(request); if(auth.response)return auth.response;
  let body:Record<string,unknown>;
  try{body=await request.json();}catch{return Response.json({error:'Invalid request.'},{status:400});}
  if(!uuid(body.requestId))return Response.json({error:'A request ID is required. Please retry from the form.'},{status:400});
  const db=await getLocalPostgresPool().connect();
  try{
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtext($1))',[body.requestId]);
    const fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const prior=await db.query("select metadata,actor_id from public.audit_logs where action='MONEY_POST' and metadata->>'requestId'=$1",[body.requestId]);
    if(prior.rowCount){if(prior.rows[0].actor_id!==auth.user!.id||prior.rows[0].metadata.fingerprint!==fingerprint)throw Error('This form was already posted with different details. Refresh before entering a new transaction.');await db.query('commit');return Response.json({ok:true,alreadyPosted:true});}
    const action=String(body.action);
    const description=String(body.description||'').trim();
    const date=body.date;
    if(!validDate(date))throw Error('Choose a valid transaction date.');
    const transactionDate=action==='EXPENSE'&&body.paid===true?(body.paymentDate||date):date;
    if(!validDate(transactionDate))throw Error('Choose a valid payment date.');
    const actor=auth.user!.id;
    const accountId=body.accountId;
    // Lock accounts in a stable order so concurrent transfers cannot deadlock.
    const ids=[accountId,body.toAccountId].filter(uuid).sort();
    const locked=await db.query('select id,name from public.cash_accounts where id=any($1::uuid[]) and is_active order by id for update',[ids]);
    const account=locked.rows.find(r=>r.id===accountId);
    const reference=String(body.externalReference||'').trim().slice(0,250);
    const post=async(amount:number,direction:string,purpose:string,desc:string,accountKey:unknown=accountId,expenseId:unknown=null,bookingId:unknown=null,suffix='')=>{
      if(!account)throw Error('Choose an active cash account.');
      await db.query(`insert into public.cash_transactions(account_id,transaction_date,type,description,amount,direction,status,reference,created_by,purpose,expense_id,booking_id,external_reference) values($1,$2,$3,$4,$5,$6,'POSTED',$7,$8,$3,$9,$10,$11)`,[accountKey,transactionDate,purpose,desc,amount/100,direction,`workflow:${body.requestId}${suffix}`,actor,expenseId,bookingId,reference||null]);
    };
    if(action==='VOID_EXPENSE'){
      if(auth.user!.role!=='ADMIN'||!uuid(body.expenseId)||description.length<5)throw Error('An administrator must select the expense and give a void reason.');
      const expense=await db.query('select status from public.expenses where id=$1 for update',[body.expenseId]);
      if(!expense.rowCount||expense.rows[0].status==='PAID')throw Error('Void the linked payment first. Paid expenses cannot be removed.');
      await db.query("update public.expenses set status='VOIDED',notes=concat_ws(E'\\n',notes,$2),updated_at=now() where id=$1",[body.expenseId,`Void reason: ${description}`]);
    }else if(action==='VOID'){
      if(auth.user!.role!=='ADMIN')throw Error('Admin access is required to void a posting.');
      if(!uuid(body.transactionId)||description.length<5)throw Error('Select a posting and enter a clear void reason.');
      const found=await db.query('select * from public.cash_transactions where id=$1 for update',[body.transactionId]);
      const tx=found.rows[0]; if(!tx)throw Error('Posting not found.');
      if(tx.purpose==='LEGACY'||tx.purpose==='TRANSFER')throw Error('Legacy postings and transfers need a reviewed correction. They cannot be voided here.');
      if(tx.status==='VOIDED')throw Error('This posting is already voided.');
      if(tx.booking_id){
        const booking=await db.query('select status from public.bookings where id=$1 for update',[tx.booking_id]);
        if(booking.rows[0]?.status==='DONE')throw Error('Reopen the booking before voiding its payment.');
        await db.query('update public.bookings set paid_amount=greatest(0,paid_amount-$2),updated_at=now() where id=$1',[tx.booking_id,tx.amount]);
        await db.query('update public.payments set voided_at=now() where reference=$1',[tx.reference]);
      }
      if(tx.expense_id)await db.query("update public.expenses set status='PENDING',paid_date=null,updated_at=now() where id=$1",[tx.expense_id]);
      await db.query("update public.cash_transactions set status='VOIDED',void_reason=$2,voided_at=now() where id=$1",[tx.id,description]);
    }else if(action==='RECEIPT'){
      if(!uuid(body.bookingId))throw Error('Select the booking being paid.');
      const found=await db.query('select * from public.bookings where id=$1 for update',[body.bookingId]);
      const b=found.rows[0]; if(!b||['CANCELLED','ARCHIVED'].includes(b.status))throw Error('Select an active or completed booking.');
      const amount=cents(body.amount); if(amount<=0||amount>Math.round((Number(b.total_amount)-Number(b.paid_amount))*100))throw Error('Payment must be positive and cannot exceed the unpaid balance.');
      await post(amount,'INFLOW','BOOKING_RECEIPT',description||`Payment - ${b.event_name}`,accountId,null,b.id);
      await db.query('insert into public.payments(booking_id,amount,payment_date,method,reference,created_by) values($1,$2,$3,$4,$5,$6)',[b.id,amount/100,date,account.name,`workflow:${body.requestId}`,actor]);
      await db.query('update public.bookings set paid_amount=paid_amount+$2,updated_at=now() where id=$1',[b.id,amount/100]);
    }else if(action==='EXPENSE'){
      const amount=cents(body.amount); if(amount<=0||!description)throw Error('Enter a description and a positive expense amount.');
      if(!['DIRECT','OPERATING'].includes(String(body.classification)))throw Error('Choose direct or operating cost.');
      if(body.bookingId&&!uuid(body.bookingId))throw Error('Choose a valid booking.');
      if(body.paid===true&&!account)throw Error('Choose the account that paid this expense.');
      const expense=await db.query(`insert into public.expenses(booking_id,description,amount,expense_date,category,classification,account,status,receipt_reference,paid_date,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,[body.bookingId||null,description,amount/100,date,String(body.category||'Other'),body.classification,account?.name||'Unassigned',body.paid===true?'PAID':'PENDING',reference||null,body.paid===true?transactionDate:null,actor]);
      if(body.paid===true)await post(amount,'OUTFLOW','EXPENSE_PAYMENT',description,accountId,expense.rows[0].id);
    }else if(action==='PAY_EXPENSE'){
      if(!uuid(body.expenseId))throw Error('Choose an expense.');
      const found=await db.query('select * from public.expenses where id=$1 for update',[body.expenseId]); const e=found.rows[0];
      if(!e||e.status==='VOIDED'||e.status==='PAID')throw Error('This expense is already paid or unavailable.');
      await post(Math.round(Number(e.amount)*100),'OUTFLOW','EXPENSE_PAYMENT',e.description,accountId,e.id);
      await db.query("update public.expenses set status='PAID',account=$2,paid_date=$3,updated_at=now() where id=$1",[e.id,account.name,date]);
    }else if(action==='TRANSFER'){
      const amount=cents(body.amount); if(amount<=0||!uuid(body.toAccountId)||body.toAccountId===accountId||!locked.rows.some(r=>r.id===body.toAccountId))throw Error('Choose two different active accounts and a positive amount.');
      await post(amount,'OUTFLOW','TRANSFER',description||'Transfer between own accounts',accountId,null,null,':out');
      await post(amount,'INFLOW','TRANSFER',description||'Transfer between own accounts',body.toAccountId,null,null,':in');
    }else if(['OWNER_CAPITAL','OWNER_DRAW','LOAN_RECEIVED','LOAN_REPAYMENT','OTHER_INCOME','ASSET_PURCHASE'].includes(action)){
      const amount=cents(body.amount); if(amount<=0||!description)throw Error('Enter a description and a positive amount.');
      await post(amount,['OWNER_CAPITAL','LOAN_RECEIVED','OTHER_INCOME'].includes(action)?'INFLOW':'OUTFLOW',action,description);
    }else throw Error('Unsupported money action.');
    await db.query("insert into public.audit_logs(actor_id,action,entity_type,metadata) values($1,'MONEY_POST','cash_transactions',$2::jsonb)",[actor,JSON.stringify({requestId:body.requestId,fingerprint,action,date,transactionDate,reason:description})]);
    await db.query('commit');return Response.json({ok:true});
  }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Posting failed.'},{status:400});}finally{db.release();}
}
