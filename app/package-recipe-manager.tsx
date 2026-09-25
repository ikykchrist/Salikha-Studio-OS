"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { showConfirm } from "../lib/ui-dialogs";

type RecipeLine = {
  id: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  pcsPerUnit: string;
  pieceCost: string;
  quantity: string;
  onHand: string;
  unitCost: string;
  lineCost: string;
  active: boolean;
};
type InventoryOption = { id: string; name: string; unit: string; onHand: string; unitCost: string; pcsPerUnit: string; pieceCost: string; active: boolean };
type DraftLine = { key: string; inventoryItemId: string; quantity: string };

const peso = (value: number) => `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PackageRecipeManager({ packageId, packageName }: { packageId: string; packageName: string }) {
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    fetch(`/api/package-recipe?packageId=${encodeURIComponent(packageId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load this recipe.");
        setRecipe(result.data as RecipeLine[]);
        setInventory(result.inventory as InventoryOption[]);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Could not load this recipe.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [packageId]);

  const totalCost = useMemo(() => recipe.reduce((sum, line) => sum + Number(line.lineCost), 0), [recipe]);
  const shortages = recipe.filter((line) => Number(line.quantity) > Number(line.onHand)).length;
  const draftChanged = JSON.stringify(draft.map(({ inventoryItemId, quantity }) => [inventoryItemId, quantity])) !==
    JSON.stringify(recipe.map(({ inventoryItemId, quantity }) => [inventoryItemId, quantity]));

  const openEditor = () => {
    setDraft(recipe.map((line) => ({ key: line.id, inventoryItemId: line.inventoryItemId, quantity: line.quantity })));
    setError("");
    setNotice("");
    setEditorOpen(true);
  };
  const closeEditor = async () => {
    if (saving) return;
    if (draftChanged && !await showConfirm("Discard your unsaved recipe changes?", { title: "Discard unsaved recipe", confirmLabel: "Discard changes", danger: true })) return;
    setEditorOpen(false);
    setError("");
  };
  const changeLine = (key: string, changes: Partial<DraftLine>) =>
    setDraft((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line));
  const saveRecipe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (draft.some((line) => !line.inventoryItemId || !line.quantity || Number(line.quantity) <= 0)) {
      setError("Select an inventory item and enter a quantity greater than zero for every line.");
      return;
    }
    if (new Set(draft.map((line) => line.inventoryItemId)).size !== draft.length) {
      setError("Each inventory item can appear only once. Adjust its quantity on the existing line.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/package-recipe", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId, lines: draft.map(({ inventoryItemId, quantity }) => ({ inventoryItemId, quantity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Recipe could not be saved.");
      setRecipe(result.data as RecipeLine[]);
      window.dispatchEvent(new CustomEvent("package-recipe-updated", { detail: { packageId } }));
      setNotice("Recipe saved.");
      setEditorOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recipe could not be saved. Your edits are still here.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="package-detail-section recipe-section">
      <div className="package-section-heading">
        <p className="eyebrow">Consumable recipe</p>
        <button className="text-button" type="button" onClick={openEditor} disabled={loading || !!loadError}>
          <Plus aria-hidden="true" /> Manage recipe
        </button>
      </div>
      {loading ? <div className="package-empty-line"><LoaderCircle className="recipe-spinner" aria-hidden="true" /><span>Loading recipe…</span></div> : loadError ?
        <p className="recipe-message recipe-error" role="alert">{loadError}</p> : recipe.length === 0 ?
          <div className="package-empty-line"><Boxes aria-hidden="true" /><span>No consumables configured.</span></div> : <>
            <div className="recipe-lines">
              {recipe.map((line) => {
                const quantity = Number(line.quantity);
                const onHand = Number(line.onHand);
                const shortage = Math.max(0, quantity - onHand);
                return <div className="recipe-summary-line" key={line.id}>
                  <div className="recipe-summary-main"><strong>{line.itemName}{!line.active && <em>Inactive</em>}</strong><span>{quantity.toLocaleString("en-PH")} {line.unit} / package · {line.pcsPerUnit} pcs/{line.unit} · {peso(Number(line.pieceCost))}/piece</span></div>
                  <div className="recipe-summary-stock">
                    <small className={shortage > 0 ? "recipe-shortage" : "recipe-available"}>{shortage > 0 ? `Short ${shortage.toLocaleString("en-PH")} ${line.unit}` : `${onHand.toLocaleString("en-PH")} ${line.unit} available`}</small>
                    <small>{peso(Number(line.lineCost))}</small>
                  </div>
                </div>;
              })}
            </div>
            <div className="recipe-total"><span>Estimated recipe cost{shortages ? ` · ${shortages} stock ${shortages === 1 ? "shortage" : "shortages"}` : ""}</span><strong>{peso(totalCost)}</strong></div>
          </>}
      {notice && <p className="recipe-message recipe-success" role="status">{notice}</p>}
    </div>

    {editorOpen && <div className="booking-overlay recipe-overlay">
      <form className="booking-drawer recipe-drawer" role="dialog" aria-modal="true" aria-labelledby="recipe-title" onSubmit={saveRecipe}>
        <div className="drawer-header"><div><p className="eyebrow">Package recipe</p><h2 id="recipe-title">Manage recipe</h2><p className="recipe-subtitle">{packageName} · one set of consumables per package</p></div><button className="close-button" type="button" onClick={closeEditor} aria-label="Close recipe editor"><X aria-hidden="true" /></button></div>
        <div className="drawer-body">
          <div className="recipe-editor-note">Quantities use each inventory item’s unit. Stock and cost are estimates only; saving a recipe does not deduct stock.</div>
          {draft.length === 0 ? <div className="recipe-editor-empty"><Boxes aria-hidden="true" /><strong>No ingredients yet</strong><span>Add the consumables needed for one package.</span></div> :
            <div className="recipe-editor-lines">
              {draft.map((line, index) => {
                const selectedItem = inventory.find((item) => item.id === line.inventoryItemId);
                const claimed = new Set(draft.filter((other) => other.key !== line.key).map((other) => other.inventoryItemId));
                return <div className="recipe-editor-line" key={line.key}>
                  <label className="recipe-item-field">Ingredient
                    <select aria-label={`Ingredient ${index + 1}`} value={line.inventoryItemId} onChange={(event) => changeLine(line.key, { inventoryItemId: event.target.value })} required>
                      <option value="">Choose inventory item</option>
                      {inventory.map((item) => <option key={item.id} value={item.id} disabled={claimed.has(item.id) || (!item.active && item.id !== line.inventoryItemId)}>{item.name}{!item.active ? " · inactive (existing only)" : ""} · {item.unit}</option>)}
                    </select>
                  </label>
                  <div className="recipe-quantity-row">
                    <label>Quantity per package
                      <div className="recipe-quantity-control"><input aria-label={`Quantity for ${selectedItem?.name || `ingredient ${index + 1}`}`} type="number" min="0.001" step="0.001" inputMode="decimal" placeholder="0.000" value={line.quantity} onChange={(event) => changeLine(line.key, { quantity: event.target.value })} required /><span>{selectedItem?.unit || "unit"}</span></div>
                    </label>
                    <button className="recipe-remove-button" type="button" onClick={() => setDraft((current) => current.filter((entry) => entry.key !== line.key))} aria-label={`Remove ingredient ${index + 1}`}><Trash2 aria-hidden="true" /></button>
                  </div>
                  {selectedItem && <small className="recipe-stock-hint">Stock {Number(selectedItem.onHand).toLocaleString("en-PH")} {selectedItem.unit} · {selectedItem.pcsPerUnit} pcs/{selectedItem.unit} · {peso(Number(selectedItem.pieceCost))}/piece · Est. {peso((Number(line.quantity) || 0) * Number(selectedItem.unitCost))}</small>}
                </div>;
              })}
            </div>}
          <button className="secondary-button recipe-add-button" type="button" onClick={() => setDraft((current) => [...current, { key: crypto.randomUUID(), inventoryItemId: "", quantity: "" }])} disabled={!inventory.some((item) => item.active)}><Plus aria-hidden="true" /> Add ingredient</button>
          {!inventory.some((item) => item.active) && <p className="recipe-message">Add an active consumable in Inventory before building this recipe.</p>}
          {error && <p className="recipe-message recipe-error" role="alert">{error}</p>}
          <div className="recipe-impact"><strong>{draft.length} {draft.length === 1 ? "ingredient" : "ingredients"}</strong><span>{draftChanged ? "Unsaved changes" : "No unsaved changes"}</span></div>
        </div>
        <div className="drawer-footer"><button className="secondary-button" type="button" onClick={closeEditor} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving || !draftChanged}>{saving ? <><LoaderCircle className="recipe-spinner" aria-hidden="true" /> Saving…</> : "Save recipe"}</button></div>
      </form>
    </div>}
  </>;
}
