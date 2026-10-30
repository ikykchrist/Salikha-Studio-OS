import { getLocalPostgresPool } from '../../../lib/local-postgres';
import { requireUser } from '../../../lib/auth';
import {cents,uuid,validDate} from '../../../lib/workflow-validation';
export const runtime='nodejs';
export async function POST(request:Request){
 const auth=await requireUser(request);if(auth.response)return auth.response;
 const b=await request.json().catch(()=>null);
 if(!b||!uuid(b.itemId)||!uuid(b.requestId)||!['STOCK_IN','USAGE','RETURN'].includes(b.type)||!/^\d{1,8}(\.\d{1,3})?$/.test(String(b.quantity))||Number(b.quantity)<=0||!String(b.notes||'').trim()||!validDate(b.date))return Response.json({error:'Choose an item, positive quantity, date and reason.'},{status:400});
 const db=await getLocalPostgresPool().connect();
 try{await db.query('begin');await db.query('select pg_advisory_xact_lock(hashtext($1))',[b.requestId]);
 const prior=await db.query('select id from public.inventory_movements where reference=$1',[`stock:${b.requestId}`]);
 if(prior.rowCount){const item=await db.query('select on_hand,average_unit_cost from public.inventory_items where id=$1',[b.itemId]);await db.query('commit');return Response.json({onHand:Number(item.rows[0].on_hand),unitCost:Number(item.rows[0].average_unit_cost),alreadyPosted:true});}
 const found=await db.query('select * from public.inventory_items where id=$1 and is_active for update',[b.itemId]);const item=found.rows[0];if(!item)throw Error('Active item not found.');
 const quantity=Number(b.quantity),stock=Number(item.on_hand);let unitCost=Number(item.average_unit_cost),average=unitCost,expenseId=null,bookingId=null;
 if(b.type==='USAGE'&&quantity>stock)throw Error('Not enough stock.');
 if(b.bookingId){if(!uuid(b.bookingId))throw Error('Choose a valid booking.');const booked=await db.query('select status,consumables_reconciled_at from public.bookings where id=$1 for update',[b.bookingId]);if(!booked.rowCount||booked.rows[0].status!=='DONE'||!booked.rows[0].consumables_reconciled_at)throw Error('Use event closeout for initial booking consumption. Additional adjustments can link only to a completed, closed-out booking.');bookingId=b.bookingId;}
 if(b.type==='RETURN'){
  if(!uuid(b.sourceUsageId))throw Error('Select the original usage being returned.');
  const source=await db.query("select * from public.inventory_movements where id=$1 and inventory_item_id=$2 and movement_type='USAGE' for update",[b.sourceUsageId,b.itemId]);const usage=source.rows[0];if(!usage)throw Error('Original usage not found.');
  const returned=await db.query("select coalesce(sum(quantity),0) as quantity from public.inventory_movements where inventory_item_id=$1 and movement_type='RETURN' and notes like $2",[b.itemId,`[return:${usage.id}]%`]);
  if(quantity>Number(usage.quantity)-Number(returned.rows[0].quantity))throw Error('Return exceeds the quantity still eligible from this usage.');
  unitCost=Number(usage.unit_cost);bookingId=usage.booking_id;
  average=(stock*average+quantity*unitCost)/(stock+quantity);
 }
 if(b.type==='STOCK_IN'){
  unitCost=cents(b.unitCost)/100;average=(stock*average+quantity*unitCost)/(stock+quantity);
  if(!['PAID','PENDING'].includes(b.paymentStatus))throw Error('Choose paid now or unpaid supplier bill.');
  if(quantity*unitCost>0){
   const account=b.paymentStatus==='PAID'&&uuid(b.accountId)?(await db.query('select id,name from public.cash_accounts where id=$1 and is_active for update',[b.accountId])).rows[0]:null;
   if(b.paymentStatus==='PAID'&&!account)throw Error('Choose the account used for this purchase.');
   const cost=Math.round(quantity*unitCost*100)/100;
   const expense=await db.query(`insert into public.expenses(description,amount,expense_date,category,classification,account,status,accounting_treatment,receipt_reference,paid_date,created_by) values($1,$2,$3,'Stock purchase','OPERATING',$4,$5,'INVENTORY_PURCHASE',$6,$7,$8) returning id`,[`Stock purchase - ${item.name}: ${quantity} ${item.unit}`,cost,b.date,account?.name||'Unassigned',b.paymentStatus,b.receiptReference||null,b.paymentStatus==='PAID'?b.date:null,auth.user!.id]);expenseId=expense.rows[0].id;
   if(account)await db.query(`insert into public.cash_transactions(account_id,transaction_date,type,description,amount,direction,status,reference,created_by,purpose,expense_id,external_reference) values($1,$2,'INVENTORY_PURCHASE',$3,$4,'OUTFLOW','POSTED',$5,$6,'INVENTORY_PURCHASE',$7,$8)`,[account.id,b.date,`Stock purchase - ${item.name}`,cost,`stock-purchase:${b.requestId}`,auth.user!.id,expenseId,b.receiptReference||null]);
  }
 }
 const next=Math.round((stock+(b.type==='USAGE'?-quantity:quantity))*1000)/1000;
 await db.query('update public.inventory_items set on_hand=$2,average_unit_cost=$3,updated_at=now() where id=$1',[b.itemId,next,average.toFixed(2)]);
 await db.query(`insert into public.inventory_movements(inventory_item_id,booking_id,movement_type,quantity,unit_cost,notes,created_by,reference,expense_id,movement_date) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date)`,[b.itemId,bookingId,b.type,quantity,unitCost,b.type==='RETURN'?`[return:${b.sourceUsageId}] ${String(b.notes).trim()}`:String(b.notes).trim(),auth.user!.id,`stock:${b.requestId}`,expenseId,b.date]);
 await db.query("insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values($1,'STOCK_MOVEMENT','inventory_items',$2,$3::jsonb)",[auth.user!.id,b.itemId,JSON.stringify({requestId:b.requestId,type:b.type,quantity,before:stock,after:next,unitCost,date:b.date})]);
 await db.query('commit');return Response.json({onHand:next,unitCost:Number(average.toFixed(2))});
 }catch(e){await db.query('rollback').catch(()=>{});return Response.json({error:e instanceof Error?e.message:'Stock posting failed.'},{status:400});}finally{db.release();}
}
