"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {CloseoutSuccess, type CloseoutSummary} from "./closeout-success";
import { Check, LoaderCircle, X } from "lucide-react";

type RecipeLine = { inventoryItemId: string; itemName: string; unit: string; quantity: string; onHand: string; unitCost: string; pcsPerUnit: string; pieceCost: string };
type Usage = { inventoryItemId: string; quantity: number };
export type Closeout = { lines: Usage[]; transportCost: number; operatorSalary: number };
const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BookingReconciliationForm({ bookingId, packageId, bookingName, onClose, onSave }: { bookingId: string; packageId: string | null; bookingName: string; onClose: () => void; onSave: (closeout: Closeout) => Promise<CloseoutSummary> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.focus();
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=='Tab')return;
      const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]);
      const first=items[0],last=items[items.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialogRef.current)){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',trap);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus();};
  },[bookingId]);
  const [success,setSuccess]=useState<CloseoutSummary|null>(null);
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!!packageId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [operatorSalary, setOperatorSalary] = useState("");

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
    try { const result=await onSave({ lines: recipe.map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: Number(quantities[line.inventoryItemId] || 0) })), transportCost: Number(transportCost) || 0, operatorSalary: Number(operatorSalary) || 0 }); setSuccess(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save usage."); }
    finally { setSaving(false); }
  };

  useEffect(()=>{if(success)dialogRef.current?.focus();},[success]);
  if(typeof document === "undefined")return null;
  if(success)return createPortal(<div onKeyDown={event=>{if(event.key==="Escape")onClose();}} ref={dialogRef} tabIndex={-1} className="booking-overlay closeout-overlay" role="dialog" aria-modal="true" aria-labelledby="reconciliation-title"><CloseoutSuccess bookingName={bookingName} summary={success} onClose={onClose}/></div>,document.body);
  return createPortal(<div ref={dialogRef} tabIndex={-1} className="booking-overlay closeout-overlay" role="dialog" aria-modal="true" aria-labelledby="reconciliation-title"><div className="calendar-setup-dialog reconciliation-dialog"><div className="drawer-header"><div><p className="eyebrow">Event closeout</p><h2 id="reconciliation-title">Event closeout</h2><small>{bookingName}</small></div><button className="close-button" type="button" onClick={onClose} disabled={saving} aria-label="Close reconciliation"><X aria-hidden="true" /></button></div><div className="calendar-setup-body"><p className="subheading">Enter actual inventory consumed (not stock packed for the event). Transport and salary entered here become unpaid costs; pay them once from Cashflow → Unpaid bills. Leave costs blank if already recorded.</p>{loading ? <p><LoaderCircle aria-hidden="true" /> Loading package recipe…</p> : recipe.length === 0 ? <p>No recipe ingredients are configured. You can still record event costs and finish closeout.</p> : <div className="form-grid">{recipe.map((line) => <label className="wide-field" key={line.inventoryItemId}>{line.itemName} · {line.unit}<input type="number" min="0" max={line.onHand} step="0.001" value={quantities[line.inventoryItemId] ?? line.quantity} onChange={(event) => setQuantities((current) => ({ ...current, [line.inventoryItemId]: event.target.value }))} /><small>Recipe: {line.quantity} {line.unit} · {line.pcsPerUnit} pcs/{line.unit} · {peso(Number(line.pieceCost))}/piece · {peso(Number(line.unitCost))}/{line.unit}</small><small>Estimated cost: {peso((Number(quantities[line.inventoryItemId] || 0) * Number(line.unitCost)))}</small></label>)}</div>}<div className="form-grid closeout-costs"><label>Actual transportation cost<div className="money-input"><span>₱</span><input type="number" min="0" step="0.01" value={transportCost} onChange={(event) => setTransportCost(event.target.value)} placeholder="0.00 (optional)" /></div></label><label>Operator salary<div className="money-input"><span>₱</span><input type="number" min="0" step="0.01" value={operatorSalary} onChange={(event) => setOperatorSalary(event.target.value)} placeholder="0.00 (optional)" /></div></label></div>{error && <p className="recipe-message recipe-error" role="alert">{error}</p>}</div><div className="drawer-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="button" onClick={() => void save()} data-intent="success" disabled={loading || saving}><Check aria-hidden="true" /> {saving ? "Saving…" : "Save and finish"}</button></div></div></div>,document.body);
}
