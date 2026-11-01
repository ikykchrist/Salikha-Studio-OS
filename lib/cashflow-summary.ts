import type { AccountRow, TransactionRow } from './financial-report';

export function cashflowSummary(accounts: AccountRow[], transactions: TransactionRow[], from: string, to: string, today: string) {
  const cents = (amount: string | number) => Math.round(Number(amount) * 100);
  const posted = transactions.filter(t => t.status === 'POSTED');
  const balance = accounts.reduce((sum, a) => sum + cents(a.opening_balance), 0) + posted.filter(t => t.transaction_date <= today).reduce((sum, t) => sum + (t.direction === 'INFLOW' ? 1 : -1) * cents(t.amount), 0);
  const period = posted.filter(t => t.transaction_date >= from && t.transaction_date <= to && t.purpose !== 'TRANSFER');
  const cashIn = period.filter(t => t.direction === 'INFLOW').reduce((sum, t) => sum + cents(t.amount), 0);
  const cashOut = period.filter(t => t.direction === 'OUTFLOW').reduce((sum, t) => sum + cents(t.amount), 0);
  const start = Date.parse(from + 'T00:00:00Z');
  const end = Date.parse(to + 'T00:00:00Z');
  const days = Math.round((end - start) / 86400000) + 1;
  // Keep the chart readable even for multi-year ranges: at most 12 equal buckets.
  const bucketDays = Math.max(1, Math.ceil(days / 12));
  const buckets: { from: string; to: string; cashIn: number; cashOut: number }[] = [];
  if (Number.isFinite(days) && days > 0) {
    for (let offset = 0; offset < days; offset += bucketDays) {
      buckets.push({ from: new Date(start + offset * 86400000).toISOString().slice(0, 10), to: new Date(Math.min(end, start + (offset + bucketDays - 1) * 86400000)).toISOString().slice(0, 10), cashIn: 0, cashOut: 0 });
    }
    for (const t of period) {
      const index = Math.floor((Date.parse(t.transaction_date + 'T00:00:00Z') - start) / 86400000 / bucketDays);
      if (buckets[index]) buckets[index][t.direction === 'INFLOW' ? 'cashIn' : 'cashOut'] += cents(t.amount);
    }
  }
  return { balance, cashIn, cashOut, net: cashIn - cashOut, buckets, hasActivity: period.length > 0 };
}
