"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";

type RecipeLine = { inventoryItemId: string; itemName: string; unit: string; quantity: string; onHand: string; unitCost: string; pcsPerUnit: string; pieceCost: string };
type Usage = { inventoryItemId: string; quantity: number };
const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BookingReconciliationForm({ bookingId, packageId, bookingName, onClose, onSave }: { bookingId: string; packageId: string | null; bookingName: string; onClose: () => void; onSave: (usage: Usage[]) => void | Promise<void> }) {
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!packageId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!packageId) return;
    const controller = new AbortController();
    fetch(`/api/package-recipe?packageId=${encodeURIComponent(packageId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load package recipe."); const lines = result.data as RecipeLine[]; setRecipe(lines); setQuantities(Object.fromEntries(lines.map((line) => [line.inventoryItemId, line.quantity]))); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load package recipe."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [packageId]);

  const save = async () => {
    setSaving(true); setError("");
    try { await onSave(recipe.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: Number(quantities[line.inventoryItemId] || 0) }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save usage."); }
    finally { setSaving(false); }
  };

  return <div className="booking-overlay" role="dialog" aria-modal="true" aria-labelledby="reconciliation-title"><div className="calendar-setup-dialog reconciliation-dialog"><div className="drawer-header"><div><p className="eyebrow">Event closeout</p><h2 id="reconciliation-title">Record actual usage</h2><small>{bookingName}</small></div><button className="close-button" type="button" onClick={onClose} aria-label="Close reconciliation"><X aria-hidden="true" /></button></div><div className="calendar-setup-body"><p className="subheading">Enter the actual amount used. Quantities are in inventory units; fractional units are allowed.</p>{loading ? <p><LoaderCircle aria-hidden="true" /> Loading package recipe…</p> : recipe.length === 0 ? <p>No recipe ingredients are configured. Save to finish closeout without an inventory deduction.</p> : <div className="form-grid">{recipe.map((line) => <label className="wide-field" key={line.inventoryItemId}>{line.itemName} · {line.unit}<input type="number" min="0" max={line.onHand} step="0.001" value={quantities[line.inventoryItemId] ?? line.quantity} onChange={(event) => setQuantities((current) => ({ ...current, [line.inventoryItemId]: event.target.value }))} /><small>Recipe: {line.quantity} {line.unit} · {line.pcsPerUnit} pcs/{line.unit} · {peso(Number(line.pieceCost))}/piece · {peso(Number(line.unitCost))}/{line.unit}</small><small>Estimated cost: {peso((Number(quantities[line.inventoryItemId] || 0) * Number(line.unitCost)))}</small></label>)}</div>}{error && <p className="recipe-message recipe-error" role="alert">{error}</p>}</div><div className="drawer-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="button" onClick={() => void save()} disabled={loading || saving}><Check aria-hidden="true" /> {saving ? "Saving…" : "Save and finish"}</button></div></div></div>;
}
