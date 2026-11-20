"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, X } from "lucide-react";
import { monthlyPackages, type BusinessAnalytics } from "../lib/booking-analytics";
import { displayPackageColor } from "../lib/package-calendar-colors";
import { formatManilaDate } from "../lib/manila-datetime";
import { WarningNotice } from "../lib/ui-dialogs";
import { money, todayManila } from "../lib/workflow-validation";
import { apiJson } from "./money-workspace";
import styles from "./business-analytics.module.css";
import { ProfitTrend } from "./profit-trend";

function EarningsChart({ income, cost, profit, through, breakdown }: BusinessAnalytics) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const loss = profit < 0;
  const total = loss ? cost : income;
  const slices = loss
    ? [{ label: "Covered by income", amount: income }, { label: "Operating loss", amount: -profit }]
    : [{ label: "Profit", amount: profit }, { label: "Direct and operating costs", amount: cost }];
  const hasPie = total > 0 && slices.every(slice => slice.amount >= 0);
  const firstShare = hasPie ? slices[0].amount / total * 100 : 0;

  return <><section className={`panel ${styles.card} ${styles.clickCard}`} onClick={() => {
    trigger.current?.focus({ preventScroll: true });
    dialog.current?.showModal();
  }}>
    <header>
      <p className="eyebrow">All time · through {formatManilaDate(through)}</p>
      <h2>Profit and costs</h2>
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
    <p className="workflow-help">Earned income includes completed bookings and other recorded income. Profit is what remains after direct and operating costs.</p>
    <button className={styles.openBreakdown} type="button" ref={trigger} aria-haspopup="dialog">
      View profit breakdown <ArrowUpRight size={16} aria-hidden="true" />
    </button>
  </section>
  <dialog className={styles.dialog} ref={dialog} aria-labelledby="profit-breakdown-title" onClick={event => {
    if (event.target === dialog.current) {
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current.close();
    }
  }}>
    <header className={styles.heading}>
      <div><p className="eyebrow">All time · through {formatManilaDate(through)}</p><h2 id="profit-breakdown-title">Profit breakdown</h2></div>
      <button type="button" className="secondary-button" aria-label="Close breakdown" onClick={() => dialog.current?.close()}><X size={18} /></button>
    </header>
    <dl className={styles.breakdown}>
      <div><dt>Completed booking revenue</dt><dd>{money(breakdown.bookingRevenue)}</dd></div>
      <div><dt>Other income</dt><dd>{money(breakdown.otherIncome)}</dd></div>
      <div className={styles.subtotal}><dt>Total earned income</dt><dd>{money(income)}</dd></div>
      <div className={styles.subtotal}><dt>Direct costs</dt><dd>{money(breakdown.directCosts)}</dd></div>
      {breakdown.directGroups.map(group => <div className={styles.category} key={group.label}><dt>{group.label}</dt><dd>{money(group.amount)}</dd></div>)}
      <div className={styles.subtotal}><dt>Operating costs</dt><dd>{money(breakdown.operatingCosts)}</dd></div>
      {breakdown.operatingGroups.map(group => <div className={styles.category} key={group.label}><dt>{group.label}</dt><dd>{money(group.amount)}</dd></div>)}
      <div className={styles.subtotal}><dt>Total costs</dt><dd>{money(cost)}</dd></div>
      <div><dt>Gross profit</dt><dd>{money(breakdown.grossProfit)}</dd></div>
      <div className={styles.subtotal}><dt>Net profit</dt><dd>{money(profit)}</dd></div>
    </dl>
  </dialog></>;
}

export function BusinessAnalyticsView() {
  const [month, setMonth] = useState(() => todayManila().slice(0, 7));
  const [showZero, setShowZero] = useState(false);
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
  const visibleRows = showZero ? rows : rows.filter(row => row.count > 0);
  const largestCount = Math.max(1, rows[0]?.count ?? 0);
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
          <label className={styles.checkbox}><input type="checkbox" checked={showZero} onChange={event => setShowZero(event.target.checked)} /> Show packages with zero bookings</label>
          {visibleRows.length > 0 && <ul className={styles.bars} aria-label={`Package bookings in ${monthLabel}`}>
            {visibleRows.map(row => <li key={row.id}>
              <span>{row.name}</span><strong>{row.count.toLocaleString("en-PH")}</strong>
              <div className={styles.track} aria-hidden="true"><i style={{
                width: `${100 * row.count / largestCount}%`,
                backgroundColor: row.id === "unassigned" ? "#8993a2" : displayPackageColor(row.color),
              }} /></div>
            </li>)}
          </ul>}
          {!total && <p className="workflow-empty">No bookings scheduled for {monthLabel}.</p>}
        </> : <p className="workflow-empty">Choose a month to see its bookings.</p>}
      </section>
      <EarningsChart {...data} />
      <ProfitTrend history={data.history} through={data.through} />
    </div>}
  </div>;
}
