import type { AccountRow, TransactionRow } from '../lib/financial-report';
import { cashflowSummary } from '../lib/cashflow-summary';
import { money, todayManila } from '../lib/workflow-validation';

export function CashflowOverview({ accounts, transactions, from, to }: { accounts: AccountRow[]; transactions: TransactionRow[]; from: string; to: string }) {
  const summary = cashflowSummary(accounts, transactions, from, to, todayManila());
  const valid = Boolean(from && to && from <= to);
  const peak = Math.max(1, ...summary.buckets.flatMap(b => [b.cashIn, b.cashOut]));
  return <>
    <section className="cashflow-summary" aria-label="Cashflow summary">
      {[['Total cash balance', summary.balance, 'Posted through today · all accounts'], ['Money in', summary.cashIn, 'Selected dates · excludes transfers'], ['Money out', summary.cashOut, 'Selected dates · excludes transfers'], ['Net cashflow', summary.net, 'Money in minus money out · not profit']].map(([label, amount, help], i) => <article className="panel" key={label}><p className="eyebrow">{label}</p><strong className={`workflow-amount ${i === 1 ? 'money-positive' : i === 2 ? 'money-out' : ''}`}>{i && !valid ? '—' : money(Number(amount) / 100)}</strong><small>{help}</small></article>)}
    </section>
    <section className="panel cashflow-chart" aria-labelledby="cashflow-chart-title">
      <div className="cashflow-chart-heading"><div><h2 id="cashflow-chart-title">Money movement</h2><p className="workflow-help">{from} – {to} · All accounts · Posted entries · Transfers excluded</p></div><div className="cashflow-chart-legend"><span><i className="cashflow-in"/> Money in</span><span><i className="cashflow-out"/> Money out</span></div></div>
      {!valid ? <p className="workflow-empty">Choose a valid date range to view cashflow.</p> : !summary.hasActivity ? <p className="workflow-empty">No posted money movements in this period.</p> : <>
        <p className="workflow-help">Shared scale · chart maximum {money(peak / 100)}. Select a date group for exact amounts.</p>
        <div className="cashflow-plot">{summary.buckets.map(b => <details className="cashflow-bucket" key={b.from}><summary aria-label={`${b.from} to ${b.to}: money in ${money(b.cashIn / 100)}, money out ${money(b.cashOut / 100)}`}><span className="cashflow-bars"><i className="cashflow-in" style={{ height: `${b.cashIn / peak * 100}%` }}/><i className="cashflow-out" style={{ height: `${b.cashOut / peak * 100}%` }}/></span><span className="cashflow-bucket-label">{b.from.slice(5)}{b.to !== b.from && <><br/>– {b.to.slice(5)}</>}</span></summary><div className="cashflow-chart-values">In {money(b.cashIn / 100)}<br/>Out {money(b.cashOut / 100)}</div></details>)}</div>
      </>}
    </section>
  </>;
}
