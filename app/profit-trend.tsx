"use client";

import { useState } from "react";
import type { BusinessAnalytics } from "../lib/booking-analytics";
import { formatManilaDate } from "../lib/manila-datetime";
import { money } from "../lib/workflow-validation";
import styles from "./business-analytics.module.css";

const axisNumber = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 2 });

export function ProfitTrend({ history, through }: Pick<BusinessAnalytics, "history" | "through">) {
  const [range, setRange] = useState<"monthly" | "annual">("monthly");
  const points = history[range];
  const monthly = range === "monthly";
  const values = points.flatMap(point => [point.gross, point.net]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const roughStep = (max - min || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(value => value * magnitude >= roughStep) ?? 10) * magnitude;
  const low = Math.floor(min / step);
  const high = Math.max(low + 1, Math.ceil(max / step));
  const ticks = Array.from({ length: high - low + 1 }, (_, index) => (high - index) * step);
  const y = (value: number) => (high - value / step) / (high - low) * 100;
  const x = (index: number) => index / (points.length - 1) * 100;
  const coordinates = (field: "gross" | "net") => points.map((point, i) => `${x(i)},${y(point[field])}`).join(" ");
  const label = (period: string, short = false) => monthly
    ? formatManilaDate(period + "-01", { month: "short", ...(short ? {} : { year: "numeric" }) })
    : period;
  const hasRecords = points.some(point => point.recorded);

  return <section className={`panel ${styles.card} ${styles.trend}`}>
    <header className={styles.heading}>
      <div><p className="eyebrow">Through {formatManilaDate(through)}</p><h2>Profit over time</h2></div>
      <div className={styles.ranges} role="group" aria-label="Profit history range">
        <button type="button" aria-pressed={monthly} onClick={() => setRange("monthly")}>1 year</button>
        <button type="button" aria-pressed={!monthly} onClick={() => setRange("annual")}>5 years</button>
      </div>
    </header>
    <div className={styles.lineLegend}><span>Gross profit</span><span>Net profit</span></div>
    {hasRecords ? <>
      <div role="img" aria-label={`Gross and net profit by ${monthly ? "month" : "year"}, ${label(points[0].period)} to ${label(points[points.length - 1].period)}. Exact amounts are available below.`} className={styles.chartFrame}>
        <div className={styles.plot}>
          {ticks.map(tick => <div aria-hidden="true" className={styles.gridline} data-zero={tick === 0} key={tick} style={{ top: y(tick) + "%" }}><span>₱{axisNumber.format(tick)}</span></div>)}
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline className={styles.grossLine} points={coordinates("gross")} />
            <polyline className={styles.netLine} points={coordinates("net")} />
          </svg>
          {points.map((point, i) => (!monthly || [0, 3, 6, 9, 11].includes(i)) &&
            <span className={styles.xTick} key={point.period} style={{ left: x(i) + "%" }}>{label(point.period, true)}</span>)}
        </div>
      </div>
      <details><summary className={styles.disclosure}>View exact amounts</summary>
        <table className={styles.amountTable}><thead><tr><th>{monthly ? "Month" : "Year"}</th><th>Gross profit</th><th>Net profit</th></tr></thead>
          <tbody>{points.map(point => <tr key={point.period}><th scope="row">{label(point.period)}</th><td>{money(point.gross)}</td><td>{money(point.net)}</td></tr>)}</tbody>
        </table>
      </details>
    </> : <p className="workflow-empty">No income or costs recorded for this period.</p>}
    <p className="workflow-help">Gross profit is earned booking revenue less direct costs. Net profit uses the operating result in Reports, including other income and operating costs.</p>
  </section>;
}
