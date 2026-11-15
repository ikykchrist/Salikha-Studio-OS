import type {AccountRow,TransactionRow} from './financial-report';

const cent = (amount: string | number) => Math.round(Number(amount) * 100);
type TransferPair = { outgoing: TransactionRow; incoming: TransactionRow };

export function transferPairs(transactions: TransactionRow[]) {
 const groups = new Map<string, TransactionRow[]>();
 for (const transaction of transactions) {
  if (transaction.status !== 'POSTED' || transaction.purpose !== 'TRANSFER' || !transaction.reference || !/:(in|out)$/.test(transaction.reference)) continue;
  const key = `${transaction.transaction_date}|${transaction.reference.slice(0, transaction.reference.lastIndexOf(':'))}`;
  const group = groups.get(key);
  if (group) group.push(transaction);
  else groups.set(key, [transaction]);
 }

 const pairs = new Map<string, TransferPair>();
 for (const group of groups.values()) {
  if (group.length !== 2) continue;
  const outgoing = group.find(t => t.direction === 'OUTFLOW' && t.reference?.endsWith(':out'));
  const incoming = group.find(t => t.direction === 'INFLOW' && t.reference?.endsWith(':in'));
  if (!outgoing || !incoming || outgoing.account_id === incoming.account_id || cent(outgoing.amount) !== cent(incoming.amount)) continue;
  const pair = { outgoing, incoming };
  pairs.set(outgoing.id, pair);
  pairs.set(incoming.id, pair);
 }
 return pairs;
}

export function cashflowRows(transactions: TransactionRow[], filters: { from: string; to: string; account: string; status: string; query: string }, pairs = transferPairs(transactions)) {
 const rows: { transaction: TransactionRow; transfer?: TransferPair }[] = [];
 const displayed = new Set<string>();
 const query = filters.query.toLowerCase();
 const searchText = (t: TransactionRow) => `${t.description} ${t.account_name} ${t.external_reference || ''} ${t.reference || ''}`;
 for (const transaction of transactions.slice().reverse()) {
  if (displayed.has(transaction.id) || transaction.transaction_date < filters.from || transaction.transaction_date > filters.to || (filters.status && transaction.status !== filters.status)) continue;
  const transfer = pairs.get(transaction.id);
  const accounts = transfer ? [transfer.outgoing.account_id, transfer.incoming.account_id] : [transaction.account_id];
  if (filters.account && !accounts.includes(filters.account)) continue;
  const searchable = transfer ? `Transfer ${searchText(transfer.outgoing)} ${searchText(transfer.incoming)}` : searchText(transaction);
  if (!searchable.toLowerCase().includes(query)) continue;
  if (transfer) {
   displayed.add(transfer.outgoing.id);
   displayed.add(transfer.incoming.id);
  } else {
   displayed.add(transaction.id);
  }
  rows.push({ transaction: transfer?.outgoing ?? transaction, transfer });
 }
 return rows;
}

/** Overall book cash after each posting, calculated before applying UI filters. */
export function combinedRunningBalances(accounts:AccountRow[],transactions:TransactionRow[],pairs = transferPairs(transactions)){
 let total=accounts.reduce((sum,a)=>sum+cent(a.opening_balance),0);
 // Stable ties preserve the authoritative SQL order (including sub-millisecond timestamps).
 const ordered=transactions.slice().sort((a,b)=>a.transaction_date.localeCompare(b.transaction_date)||a.created_at.localeCompare(b.created_at));
 const balances=new Map<string,number>();
 for(const t of ordered){
  if(balances.has(t.id))continue;
  const pair=pairs.get(t.id);
  if(t.status==='POSTED'&&pair){
   // Own-account transfers are one atomic movement: no artificial dip or increase.
   balances.set(pair.outgoing.id,total/100);
   balances.set(pair.incoming.id,total/100);
   continue;
  }
  if(t.status==='POSTED')total+=(t.direction==='INFLOW'?1:-1)*cent(t.amount);
  balances.set(t.id,total/100);
 }
 return balances;
}
