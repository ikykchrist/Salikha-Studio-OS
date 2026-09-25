"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, CircleAlert } from "lucide-react";

type Props = { packageId: string; basePrice: number };

const money = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numberValue = (value: string) => Math.max(0, Number(value) || 0);

export function PackageProfitabilityCalculator({ packageId, basePrice }: Props) {
  const [price, setPrice] = useState(String(basePrice));
  const [consumables, setConsumables] = useState("");
  const [transport, setTransport] = useState("");
  const [staff, setStaff] = useState("");
  const [food, setFood] = useState("");
  const [otherDirect, setOtherDirect] = useState("");
  const [hours, setHours] = useState("6");
  const [laborRate, setLaborRate] = useState("300");
  const [monthlyOverhead, setMonthlyOverhead] = useState("");
  const [monthlyEvents, setMonthlyEvents] = useState("8");
  const [taxRate, setTaxRate] = useState("");
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [recipeMessage, setRecipeMessage] = useState("");

  useEffect(() => {
    setPrice(String(basePrice));
    let cancelled = false;
    setLoadingRecipe(true);
    fetch(`/api/package-recipe?packageId=${encodeURIComponent(packageId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load recipe cost.");
        const cost = (result.data || []).reduce((sum: number, line: { lineCost?: string }) => sum + numberValue(line.lineCost || ""), 0);
        if (!cancelled) { setConsumables(cost.toFixed(2)); setRecipeMessage(cost ? "Loaded from package recipe." : "No consumables in recipe yet."); }
      })
      .catch(() => { if (!cancelled) setRecipeMessage("Enter consumables cost manually; recipe unavailable."); })
      .finally(() => { if (!cancelled) setLoadingRecipe(false); });
    return () => { cancelled = true; };
  }, [basePrice, packageId]);

  const result = useMemo(() => {
    const direct = [consumables, transport, staff, food, otherDirect].reduce((sum, item) => sum + numberValue(item), 0);
    const labor = numberValue(hours) * numberValue(laborRate);
    const overhead = numberValue(monthlyOverhead) / Math.max(1, numberValue(monthlyEvents));
    const breakEven = direct + labor + overhead;
    const grossProfit = numberValue(price) - breakEven;
    const tax = Math.max(0, grossProfit) * numberValue(taxRate) / 100;
    const netProfit = grossProfit - tax;
    return { direct, labor, overhead, breakEven, grossProfit, tax, netProfit, margin: numberValue(price) ? (netProfit / numberValue(price)) * 100 : 0 };
  }, [consumables, transport, staff, food, otherDirect, hours, laborRate, monthlyOverhead, monthlyEvents, price, taxRate]);

  const field = (label: string, value: string, setValue: (value: string) => void, hint?: string) => <label className="profitability-field">{label}<div className="money-input"><span>₱</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} /></div>{hint && <small>{hint}</small>}</label>;

  return <section className="profitability-calculator">
    <div className="package-section-heading"><div><p className="eyebrow">Decision tool</p><h3><Calculator aria-hidden="true" /> Package profitability</h3></div><span className="package-addon-count">Estimate only</span></div>
    <p className="profitability-intro">Isama ang lahat ng oras at gastos para makita ang tunay na tubo bago mag-quote.</p>
    <div className="profitability-form-grid">
      {field("Selling price", price, setPrice)}
      {field("Consumables / recipe", consumables, setConsumables, loadingRecipe ? "Loading recipe cost…" : recipeMessage)}
      {field("Transport / toll", transport, setTransport)}
      {field("Extra staff", staff, setStaff)}
      {field("Food / allowance", food, setFood)}
      {field("Other direct cost", otherDirect, setOtherDirect)}
      <label className="profitability-field">Total hours (prep + travel + event + cleanup)<input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
      {field("Your labor rate / hour", laborRate, setLaborRate)}
      {field("Monthly fixed overhead", monthlyOverhead, setMonthlyOverhead, "Rent, software, ads, maintenance, etc.")}
      <label className="profitability-field">Expected events / month<input type="number" min="1" step="1" value={monthlyEvents} onChange={(event) => setMonthlyEvents(event.target.value)} /></label>
      <label className="profitability-field">Tax rate (optional)<div className="money-input"><input type="number" min="0" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /><span>%</span></div></label>
    </div>
    <div className="profitability-results">
      <div><span>Break-even price</span><strong>{money(result.breakEven)}</strong><small>Minimum to cover costs</small></div>
      <div><span>Direct costs</span><strong>{money(result.direct)}</strong><small>Materials and event costs</small></div>
      <div><span>Labor + overhead</span><strong>{money(result.labor + result.overhead)}</strong><small>{money(result.labor)} labor · {money(result.overhead)} overhead</small></div>
      <div className={result.netProfit >= 0 ? "profit-positive" : "profit-negative"}><span>Estimated net profit</span><strong>{money(result.netProfit)}</strong><small>{result.margin.toFixed(1)}% net margin after tax</small></div>
    </div>
    <div className={`profitability-status ${result.netProfit >= 0 ? "is-positive" : "is-negative"}`}><CircleAlert aria-hidden="true" /><span>{result.netProfit >= 0 ? "Profitable at these assumptions. Review them regularly." : "Below break-even. Raise the price or reduce costs before accepting this package."}</span></div>
  </section>;
}
