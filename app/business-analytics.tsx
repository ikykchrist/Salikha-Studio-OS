"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { monthlyPackages, type BusinessAnalytics } from "../lib/booking-analytics";
import { formatManilaDate } from "../lib/manila-datetime";
import { WarningNotice } from "../lib/ui-dialogs";
import { money, todayManila } from "../lib/workflow-validation";
import { apiJson } from "./money-workspace";
import styles from "./business-analytics.module.css";

function EarningsChart({ income, cost, profit, through }: BusinessAnalytics) {
  const loss = profit < 0;
  const total = loss ? cost : income;
  const slices = loss
    ? [{ label: "Covered by income", amount: income }, { label: "Operating loss", amount: -profit }]
    : [{ label: "Kinita · Operating profit", amount: profit }, { label: "Direct and operating costs", amount: cost }];
  const hasPie = total > 0 && slices.every(slice => slice.amount >= 0);
  const firstShare = hasPie ? slices[0].amount / total * 100 : 0;

  return <section className={`panel ${styles.card}`}>
    <header>
      <p className="eyebrow">All time · through {formatManilaDate(through)}</p>
      <h2>Kinita and costs</h2>
    </header>
    <div className={styles.metric}>
      <span>{loss ? "Total costs" : "Total earned income"}</span>
      <strong>{money(total)}</strong>
    </div>
    {hasPie ? <figure className={styles.figure}>
      <div className={styles.pie} aria-hidden="true" style={{
        background: `conic-gradient(var(--chart-income) 0% ${firstShare}%, var(--chart-cost) ${firstShare}% 100%)`,
      }} />
      <figcaption className={styles.legend}>
        {slices.map(slice => <div key={slice.label}>
          <span><i aria-hidden="true" />{slice.label}</span>
          <strong>{money(slice.amount)} <small>({(slice.amount / total * 100).toFixed(1)}%)</small></strong>
        </div>)}
      </figcaption>
    </figure> : income === 0 && cost === 0
      ? <p className="workflow-empty">No earned income or net costs to chart yet.</p>
      : <p className="workflow-help">Earned income {money(income)} · Net costs {money(cost)} · Operating result {money(profit)}. A negative amount prevents a percentage split.</p>}
    <p className="workflow-help">Earned income includes completed bookings and other recorded income. Kinita is what remains after direct and operating costs.</p>
  </section>;
}

export function BusinessAnalyticsView() {
  const [month, setMonth] = useState(() => todayManila().slice(0, 7));
  const [data, setData] = useState<BusinessAnalytics | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    apiJson("/api/analytics").then((summary: BusinessAnalytics) => {
      if (current) setData(summary);
    }).catch((cause: Error) => {
      if (current) setError(cause.message);
    });
    return () => { current = false; };
  }, [revision]);
  const rows = data ? monthlyPackages(data.packages, data.months[month] ?? {}) : [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const monthLabel = formatManilaDate(month + "-01", { month: "long", year: "numeric" });

  return <div className="workflow-workspace">
    <section className="page-heading">
      <div><p className="eyebrow">Business</p><h1>Analytics</h1></div>
      <button type="button" className="secondary-button" disabled={!data && !error} onClick={() => setRevision(n => n + 1)}>
        <RefreshCw aria-hidden="true" /> Refresh records
      </button>
    </section>
    {error && <WarningNotice>{error}</WarningNotice>}
    {!data && !error && <p role="status">Loading booking and financial records…</p>}
    {data && <div className={styles.grid}>
      <section className={`panel ${styles.card}`}>
        <header className={styles.heading}>
          <h2>Monthly bookings</h2>
          <label>Event month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
        </header>
        {month ? <>
          <div className={styles.metric} aria-live="polite">
            <span>Bookings in {monthLabel}</span><strong>{total.toLocaleString("en-PH")}</strong>
          </div>
          <p className="workflow-help">Counts pending, confirmed and completed bookings by event date.</p>
          {rows.length > 0 && <table className={styles.table}>
            <thead><tr><th scope="col">Package</th><th scope="col">Bookings</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.count.toLocaleString("en-PH")}</td></tr>)}</tbody>
          </table>}
          {!total && <p className="workflow-empty">No bookings scheduled for {monthLabel}.</p>}
        </> : <p className="workflow-empty">Choose a month to see its bookings.</p>}
      </section>
      <EarningsChart {...data} />
    </div>}
  </div>;
}
