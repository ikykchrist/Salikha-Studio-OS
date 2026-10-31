import type {AccountRow,TransactionRow} from './financial-report';

/** Overall book cash after each posting, calculated before applying UI filters. */
export function combinedRunningBalances(accounts:AccountRow[],transactions:TransactionRow[]){
 const cent=(amount:string|number)=>Math.round(Number(amount)*100);
 let total=accounts.reduce((sum,a)=>sum+cent(a.opening_balance),0);
 // Stable ties preserve the authoritative SQL order (including sub-millisecond timestamps).
 const ordered=transactions.slice().sort((a,b)=>a.transaction_date.localeCompare(b.transaction_date)||a.created_at.localeCompare(b.created_at));
 const balances=new Map<string,number>();
 const transfers=new Map<string,TransactionRow[]>();
 for(const t of ordered){
  if(t.status!=='POSTED'||t.purpose!=='TRANSFER'||!t.reference||!/:(in|out)$/.test(t.reference))continue;
  const key=t.transaction_date+'|'+t.reference.replace(/:(in|out)$/,'');
  transfers.set(key,[...(transfers.get(key)||[]),t]);
 }
 for(const t of ordered){
  if(balances.has(t.id))continue;
  const pair=t.purpose==='TRANSFER'&&t.reference?transfers.get(t.transaction_date+'|'+t.reference.replace(/:(in|out)$/,'')):undefined;
  if(t.status==='POSTED'&&pair?.length===2&&pair[0].direction!==pair[1].direction&&pair[0].account_id!==pair[1].account_id&&cent(pair[0].amount)===cent(pair[1].amount)){
   // Own-account transfers are one atomic movement: no artificial dip or increase.
   for(const leg of pair)balances.set(leg.id,total/100);
   continue;
  }
  if(t.status==='POSTED')total+=(t.direction==='INFLOW'?1:-1)*cent(t.amount);
  balances.set(t.id,total/100);
 }
 return balances;
}
