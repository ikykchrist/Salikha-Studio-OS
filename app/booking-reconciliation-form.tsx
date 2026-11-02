"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {CloseoutSuccess, type CloseoutSummary} from "./closeout-success";
import {paperSheetCount} from "../lib/ink-estimate";
import { Check, LoaderCircle, Plus, Trash2, X } from "lucide-react";

type RecipeLine = { inventoryItemId: string; itemName: string; category?:string; unit: string; quantity: string; onHand: string; unitCost: string; pcsPerUnit: string; pieceCost: string };
type Usage = { inventoryItemId: string; quantity: number };
export type Closeout = { lines: Usage[]; transportCost: number; operatorSalary: number; printerNo:number|null; printedSheets:number };
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
  const [inventory, setInventory] = useState<RecipeLine[]>([]);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [extraChoice, setExtraChoice] = useState("");
  const [addonNames, setAddonNames] = useState<string[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState("");
  const [loading, setLoading] = useState(!!packageId);
  const [recipeFailed,setRecipeFailed]=useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [operatorSalary, setOperatorSalary] = useState("");
  const [printerNo,setPrinterNo]=useState(''),[printedOverride,setPrintedOverride]=useState<string|null>(null);
  const [inkProfiles,setInkProfiles]=useState<{printer_no:number;ml_per_sheet:string;reference_capacity_ml:string}[]>([]);
  useEffect(()=>{const abort=new AbortController();fetch('/api/printer-ink',{cache:'no-store',signal:abort.signal}).then(async r=>{if(!r.ok)return;const data=await r.json();setInkProfiles(data.profiles||[]);}).catch(()=>{});return()=>abort.abort();},[]);
  const extraMaterials = extraIds.map((id) => inventory.find((item) => item.inventoryItemId === id)).filter((item): item is RecipeLine => Boolean(item));
  const derivedSheets=paperSheetCount([...recipe,...extraMaterials].map(line=>({itemName:line.itemName,unit:line.unit,category:line.category,quantity:Number(quantities[line.inventoryItemId]||0)})));
  const printedSheets=printedOverride===null?derivedSheets:Number(printedOverride);
  const selectedProfile=inkProfiles.find(p=>p.printer_no===Number(printerNo));
  const availableExtras=inventory.filter((item)=>!recipe.some((line)=>line.inventoryItemId===item.inventoryItemId)&&!extraIds.includes(item.inventoryItemId));

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/closeout-materials?bookingId=${encodeURIComponent(bookingId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load inventory."); return result; })
      .then((result: { inventory: RecipeLine[]; addons: Array<{name:string}> }) => { if (!controller.signal.aborted) { setInventory(result.inventory); setAddonNames(Array.isArray(result.addons) ? result.addons.map((item) => item.name) : []); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setMaterialsError(cause instanceof Error ? cause.message : "Could not load inventory."); })
      .finally(() => { if (!controller.signal.aborted) setMaterialsLoading(false); });
    return () => controller.abort();
  }, [bookingId]);

  useEffect(() => {
    if (!packageId) return;
    const controller = new AbortController();
    fetch(`/api/package-recipe?packageId=${encodeURIComponent(packageId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load package recipe."); const lines = result.data as RecipeLine[]; setRecipe(lines); setQuantities(Object.fromEntries(lines.map((line) => [line.inventoryItemId, line.quantity]))); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) {setRecipeFailed(true);setError(cause instanceof Error ? cause.message : "Could not load package recipe.");} })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [packageId]);

  const save = async () => {
    if(!Number.isInteger(printedSheets)||printedSheets<0){setError('Enter a whole number of printed 4R sheets.');return;}
    if(printedSheets>0&&!printerNo){setError('Select which printer produced the prints.');return;}
    setSaving(true); setError("");
    try { const result=await onSave({ lines: [...recipe,...extraMaterials].map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: Number(quantities[line.inventoryItemId] || 0) })), transportCost: Number(transportCost) || 0, operatorSalary: Number(operatorSalary) || 0,printerNo:printerNo?Number(printerNo):null,printedSheets }); setSuccess(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save usage."); }
    finally { setSaving(false); }
  };

  useEffect(()=>{if(success)dialogRef.current?.focus();},[success]);
  if(typeof document === "undefined")return null;
  if(success)return createPortal(<div onKeyDown={event=>{if(event.key==="Escape")onClose();}} ref={dialogRef} tabIndex={-1} className="booking-overlay closeout-overlay" role="dialog" aria-modal="true" aria-labelledby="reconciliation-title"><CloseoutSuccess bookingName={bookingName} summary={success} onClose={onClose}/></div>,document.body);
  return createPortal(<div ref={dialogRef} tabIndex={-1} className="booking-overlay closeout-overlay" role="dialog" aria-modal="true" aria-labelledby="reconciliation-title"><div className="calendar-setup-dialog reconciliation-dialog"><div className="drawer-header"><div><p className="eyebrow">Event closeout</p><h2 id="reconciliation-title">Event closeout</h2><small>{bookingName}</small></div><button className="close-button" type="button" onClick={onClose} disabled={saving} aria-label="Close reconciliation"><X aria-hidden="true" /></button></div><div className="calendar-setup-body"><p className="subheading">Enter actual inventory consumed (not stock packed for the event). Transport and salary entered here become unpaid costs; pay them once from Cashflow → Unpaid bills. Leave costs blank if already recorded.</p>{loading ? <p><LoaderCircle aria-hidden="true" /> Loading package recipe…</p> : recipe.length === 0 ? <p>No recipe ingredients are configured. You can still record event costs and finish closeout.</p> : <div className="form-grid">{recipe.map((line) => <label className="wide-field" key={line.inventoryItemId}>{line.itemName} · {line.unit}<input type="number" min="0" max={line.onHand} step="0.001" value={quantities[line.inventoryItemId] ?? line.quantity} onChange={(event) => setQuantities((current) => ({ ...current, [line.inventoryItemId]: event.target.value }))} /><small>Recipe: {line.quantity} {line.unit} · {line.pcsPerUnit} pcs/{line.unit} · {peso(Number(line.pieceCost))}/piece · {peso(Number(line.unitCost))}/{line.unit}</small><small>Estimated cost: {peso((Number(quantities[line.inventoryItemId] || 0) * Number(line.unitCost)))}</small></label>)}</div>}<section className="closeout-extra-materials"><h3>Additional materials</h3><p className="workflow-help">Use this for add-ons or unplanned ingredients. Actual usage may exceed the package recipe estimate; stock on hand is the limit.</p>{addonNames.length>0&&<p className="workflow-help"><strong>Booked add-ons:</strong> {addonNames.join(", ")}</p>}{materialsLoading?<p className="workflow-help">Loading inventory materials…</p>:materialsError?<p className="form-warning" role="alert">{materialsError}</p>:<><div className="closeout-add-material"><select aria-label="Choose additional material" value={extraChoice} onChange={(event)=>setExtraChoice(event.target.value)}><option value="">Choose inventory material</option>{availableExtras.map((item)=><option key={item.inventoryItemId} value={item.inventoryItemId}>{item.itemName} · {item.onHand} {item.unit} available</option>)}</select><button className="secondary-button" type="button" disabled={!extraChoice} onClick={()=>{const item=inventory.find((entry)=>entry.inventoryItemId===extraChoice);if(!item)return;setExtraIds((current)=>[...current,extraChoice]);setQuantities((current)=>({...current,[extraChoice]:String(Math.min(1,Number(item.onHand)))}));setExtraChoice("");}}><Plus aria-hidden="true"/> Add material</button></div>{extraMaterials.length>0&&<div className="form-grid closeout-extra-list">{extraMaterials.map((line)=><div className="closeout-extra-row" key={line.inventoryItemId}><label>{line.itemName} · {line.unit}<input type="number" min="0" max={line.onHand} step="0.001" value={quantities[line.inventoryItemId]??"0"} onChange={(event)=>setQuantities((current)=>({...current,[line.inventoryItemId]:event.target.value}))}/><small>Available: {line.onHand} {line.unit} · Cost: {peso(Number(quantities[line.inventoryItemId]||0)*Number(line.unitCost))}</small></label><button className="close-button" type="button" aria-label={`Remove ${line.itemName}`} onClick={()=>{setExtraIds((current)=>current.filter((id)=>id!==line.inventoryItemId));setQuantities((current)=>{const next={...current};delete next[line.inventoryItemId];return next;});}}><Trash2 aria-hidden="true"/></button></div>)}</div>}</>}</section><section className="closeout-ink-estimate"><h3>Estimated ink consumption</h3><p className="workflow-help">One paper pack = 20 sheets. Based on actual paper used above; change the printed count for test prints, reprints, or unprinted waste. Ink is estimated across all six colors equally.</p><div className="form-grid"><label>4R sheets printed<input type="number" min="0" max="1000000" step="1" value={printedOverride??String(derivedSheets)} onChange={e=>setPrintedOverride(e.target.value)}/></label><label>Printer used<select value={printerNo} onChange={e=>setPrinterNo(e.target.value)}><option value="">Choose printer</option><option value="1">Printer 1</option><option value="2">Printer 2</option></select></label></div>{printedOverride!==null&&<button className="text-button" type="button" onClick={()=>setPrintedOverride(null)}>Use paper-pack calculation ({derivedSheets} sheets)</button>}<p className="workflow-help">{printedSheets>0?`${printedSheets} sheets = ${(printedSheets*Number(selectedProfile?.ml_per_sheet??0.2)).toFixed(2)} mL estimated ink. ${selectedProfile?`Model: ${selectedProfile.ml_per_sheet} mL/sheet; ${selectedProfile.reference_capacity_ml} mL full-level reference per color.`:'Default model: 0.20 mL/sheet; final calculation uses the saved printer profile.'}`:'0 printed sheets: no estimated ink deduction.'} Cost is included in event profitability; no cash posting or supplier bill is created.</p></section><div className="form-grid closeout-costs"><label>Actual transportation cost<div className="money-input"><span>₱</span><input type="number" min="0" step="0.01" value={transportCost} onChange={(event) => setTransportCost(event.target.value)} placeholder="0.00 (optional)" /></div></label><label>Operator salary<div className="money-input"><span>₱</span><input type="number" min="0" step="0.01" value={operatorSalary} onChange={(event) => setOperatorSalary(event.target.value)} placeholder="0.00 (optional)" /></div></label></div>{error && <p className="recipe-message recipe-error" role="alert">{error}</p>}</div><div className="drawer-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="button" onClick={() => void save()} data-intent="success" disabled={loading || materialsLoading || saving || recipeFailed || Boolean(materialsError)}><Check aria-hidden="true" /> {saving ? "Saving…" : "Save and finish"}</button></div></div></div>,document.body);
}
