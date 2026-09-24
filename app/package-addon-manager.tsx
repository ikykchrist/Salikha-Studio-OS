"use client";

import { useEffect, useState } from "react";
import { ListPlus, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { getLocalDatabase } from "../lib/local-database";

type Addon = { id: string; name: string; price: number; active: boolean };

export function PackageAddonManager({ packageId }: { packageId: string }) {
  const [items, setItems] = useState<Addon[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const database = getLocalDatabase();
      if (!database) { setError("Local database is unavailable."); setLoading(false); return; }
      const result = await database.from("package_addons").select("id, name, price, is_active").eq("package_id", packageId).order("name");
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else setItems((result.data || []).map((row: { id: string; name: string; price: number; is_active: boolean }) => ({ id: row.id, name: row.name, price: Number(row.price), active: row.is_active })));
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [packageId]);

  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) return;
    const database = getLocalDatabase();
    if (!database) { setError("Local database is unavailable."); return; }
    setSaving(true); setError("");
    const result = await database.from("package_addons").insert({ package_id: packageId, name: name.trim(), price: Number(price), is_active: true }).select("id, name, price, is_active").single();
    setSaving(false);
    if (result.error || !result.data) { setError(result.error?.message || "Add-on was not saved."); return; }
    setItems((current) => [...current, { id: result.data.id, name: result.data.name, price: Number(result.data.price), active: result.data.is_active }].sort((a, b) => a.name.localeCompare(b.name)));
    setName(""); setPrice("");
  };

  const remove = async (item: Addon) => {
    if (!window.confirm(`Remove “${item.name}” from this package?`)) return;
    const database = getLocalDatabase();
    if (!database) { setError("Local database is unavailable."); return; }
    setError("");
    const result = await database.from("package_addons").delete().eq("id", item.id).eq("package_id", packageId);
    if (result.error) { setError(result.error.message); return; }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  return <div className="package-detail-section"><div className="package-section-heading"><p className="eyebrow">Add-ons</p><span className="package-addon-count">{items.length} {items.length === 1 ? "option" : "options"}</span></div>
    {loading ? <div className="package-empty-line"><LoaderCircle className="recipe-spinner" aria-hidden="true" /><span>Loading add-ons…</span></div> : items.length ? <div className="package-addon-list">{items.map((item) => <div className="package-addon-row" key={item.id}><span><ListPlus aria-hidden="true" />{item.name}</span><strong>₱{item.price.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong><button className="recipe-remove-button" type="button" onClick={() => void remove(item)} aria-label={`Remove ${item.name}`}><Trash2 aria-hidden="true" /></button></div>)}</div> : <div className="package-empty-line"><ListPlus aria-hidden="true" /><span>No add-ons configured.</span></div>}
    <form className="package-addon-form" onSubmit={add}><label>Add an option<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Extra hour" required /></label><label>Price<div className="money-input"><span>₱</span><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" required /></div></label><button className="secondary-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="recipe-spinner" aria-hidden="true" /> : <Plus aria-hidden="true" />} Add</button></form>
    {error && <p className="recipe-message recipe-error" role="alert">{error}</p>}
  </div>;
}
