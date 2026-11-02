"use client";

import { useEffect, useState } from "react";
import { MapPin, ShieldCheck, X } from "lucide-react";
import { showConfirm, showNotice } from "../lib/ui-dialogs";

type BookingRecord = { id: string; client: string; eventName: string; date: string; startTime: string; endTime: string; venue: string; mapsUrl?: string; packageId?: string | null; packageName: string; addonIds?: string[]; total: number; paidAmount?: number; downpaymentAmount?: number; status: "PENDING" | "DONE" | "CANCELLED"; preparation: { layoutReady: boolean; venueReady: boolean; backdropColor: string | null } };
type PackageOption = { id: string; name: string; base_price: number; duration: string | null; inclusions: string | null; is_active: boolean };

export function BookingEditForm({ booking, onClose, onSave }: { booking: BookingRecord; onClose: () => void; onSave: (booking: BookingRecord) => void | Promise<void> }) {
  const [eventName, setEventName] = useState(booking.eventName);
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [endTime, setEndTime] = useState(booking.endTime);
  const [venue, setVenue] = useState(booking.venue);
  const [mapsUrl, setMapsUrl] = useState(booking.mapsUrl || "");
  const [packageId, setPackageId] = useState(booking.packageId || "");
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [packageLoadError, setPackageLoadError] = useState("");
  const [addonOptions, setAddonOptions] = useState<Array<{ id: string; name: string; price: number; archived?: boolean }>>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [addonLoading, setAddonLoading] = useState(true);
  const [addonError, setAddonError] = useState("");
  const [transportAmount, setTransportAmount] = useState(0);
  const [recipeCost, setRecipeCost] = useState<number | null>(null);
  const [total, setTotal] = useState(String(booking.total));
  const [status, setStatus] = useState(booking.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/booking-packages", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load packages.");
        if (!cancelled) setPackages(result.packages);
      } catch (cause) { if (!cancelled) setPackageLoadError(cause instanceof Error ? cause.message : "Could not load packages."); }
    })();
    return () => { cancelled = true; };
  }, []);
  const chosenPackage = packages.find((item) => item.id === packageId);
  const packageChanged = packageId !== (booking.packageId || "");
  useEffect(() => {
    let cancelled = false;
    setAddonLoading(true); setAddonError("");
    void fetch(`/api/booking-addons?bookingId=${encodeURIComponent(booking.id)}&packageId=${encodeURIComponent(packageId)}`, { cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load add-ons."); return result; })
      .then((result: { addons: Array<{id:string;name:string;price:number}>; saved: Array<{id:string;name:string;price:number}>; transportAmount:number }) => {
        if (cancelled) return;
        const saved = packageId === booking.packageId ? (Array.isArray(result.saved) ? result.saved : []) : [];
        const active = result.addons.map((item) => ({ ...item, price: Number(saved.find((previous) => previous.id === item.id)?.price ?? item.price) }));
        setAddonOptions([...active, ...saved.filter((item) => !active.some((option) => option.id === item.id)).map((item) => ({ ...item, price: Number(item.price), archived: true }))]);
        setSelectedAddonIds(saved.map((item) => item.id));
        setTransportAmount(Number(result.transportAmount) || 0);
      })
      .catch((cause: unknown) => { if (!cancelled) setAddonError(cause instanceof Error ? cause.message : "Could not load add-ons."); })
      .finally(() => { if (!cancelled) setAddonLoading(false); });
    return () => { cancelled = true; };
  }, [booking.id, booking.packageId, packageId]);
  const addonTotal = addonOptions.filter((item) => selectedAddonIds.includes(item.id)).reduce((sum, item) => sum + Number(item.price), 0);
  const toggleAddon = (id: string, checked: boolean) => {
    const option = addonOptions.find((item) => item.id === id);
    if (!option) return;
    setSelectedAddonIds((current) => checked ? [...current, id] : current.filter((item) => item !== id));
    setTotal((current) => String(Math.max(0, (Math.round(Number(current) * 100) + (checked ? 1 : -1) * Math.round(option.price * 100)) / 100)));
  };
  useEffect(() => {
    if (!packageId) { setRecipeCost(null); return; }
    let cancelled = false;
    setRecipeCost(null);
    void fetch(`/api/package-recipe?packageId=${encodeURIComponent(packageId)}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Recipe unavailable."); return response.json(); })
      .then((result) => { if (!cancelled) setRecipeCost((result.data as Array<{ lineCost: string }>).reduce((sum, line) => sum + Number(line.lineCost || 0), 0)); })
      .catch(() => { if (!cancelled) setRecipeCost(null); });
    return () => { cancelled = true; };
  }, [packageId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!eventName.trim() || !date || !Number.isFinite(Number(total)) || Number(total) < Number(booking.paidAmount || 0)) { setError("Enter an event, date, and total at least as much as payments already received."); return; }
    if (packageLoadError || !packages.length && packageId || addonError || addonLoading) { setError(addonError || "Package add-ons could not be verified. Retry before saving."); return; }
    setSaving(true);
    try { await onSave({ ...booking, eventName: eventName.trim(), date, startTime, endTime, venue: venue.trim(), mapsUrl: mapsUrl.trim(), packageId: packageId || null, packageName: chosenPackage?.name || (packageId ? booking.packageName : "Custom service"), addonIds: selectedAddonIds, total: Number(total), status }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save booking."); }
    finally { setSaving(false); }
  };
  const requestDelete = async (password?: string) => {
    const response = await fetch("/api/record-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ table: "bookings", id: booking.id, ...(password ? { adminPassword: password } : {}) }) });
    const result = await response.json() as { error?: string; action?: string; message?: string; overrideRequired?: boolean; linkedRecords?: Record<string, number>; calendarCleanupWarning?: boolean };
    if (result.overrideRequired) { setDeleteError(password ? result.error || "Administrator password is incorrect." : ""); setOverrideOpen(true); return false; }
    if (!response.ok) throw new Error(result.error || "Booking could not be removed.");
    if (result.action === "archived") await showNotice(result.message || "The booking was archived because it has linked records.", "Booking archived");
    else await showNotice(result.message || "The booking and its linked financial/operational records were permanently removed. Used stock has been restored.", result.calendarCleanupWarning ? "Booking deleted with a calendar warning" : "Booking deleted");
    window.location.reload();
    return true;
  };
  const deleteBooking = async () => {
    if (!await showConfirm(`Delete “${booking.eventName}”? If it has financial or operational history, you’ll be asked to verify your administrator password before those linked records are permanently removed.`, { title: "Delete booking", confirmLabel: "Delete booking", danger: true })) return;
    setDeleteBusy(true); setDeleteError("");
    try { await requestDelete(); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Booking could not be removed."); }
    finally { setDeleteBusy(false); }
  };
  const confirmOverride = async () => {
    if (!adminPassword) { setDeleteError("Enter your administrator password to continue."); return; }
    setDeleteBusy(true); setDeleteError("");
    try { await requestDelete(adminPassword); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Booking could not be removed."); }
    finally { setDeleteBusy(false); }
  };

  return <><div className="booking-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-edit-title">
    <form className="booking-drawer" onSubmit={(event) => void submit(event)}>
      <div className="drawer-header"><div><p className="eyebrow">Booking editor</p><h2 id="booking-edit-title">Edit booking</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close booking editor"><X aria-hidden="true" /></button></div>
      <div className="drawer-body"><div className="form-section"><div className="form-grid">
        <label className="wide-field">Client<input value={booking.client} readOnly /></label>
        <label className="wide-field">Event name<input value={eventName} onChange={(event) => setEventName(event.target.value)} required /></label>
        <label>Event date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label>Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
        <label>End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        <label className="wide-field">Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} /></label>
        <label className="wide-field">Google Maps link<div className="input-with-icon"><MapPin aria-hidden="true" /><input type="url" value={mapsUrl} onChange={(event) => setMapsUrl(event.target.value)} placeholder="Paste Maps link (optional)" /></div></label>
        <label className="wide-field">Package<select value={packageId} onChange={(event) => { const nextId = event.target.value; setPackageId(nextId); setSelectedAddonIds([]); const item = packages.find((entry) => entry.id === nextId); setTotal(String(item ? Number(item.base_price) + transportAmount : Math.max(0, Number(total) - addonTotal))); }} disabled={Boolean(packageLoadError) || saving}><option value="">Custom service</option>{packages.filter((item) => item.is_active || item.id === booking.packageId).map((item) => <option key={item.id} value={item.id}>{item.name}{!item.is_active ? " (archived)" : ""} · ₱{Number(item.base_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</option>)}</select></label>
        <fieldset className="wide-field booking-addon-field"><legend>Add-ons · select multiple</legend>{addonLoading ? <p className="workflow-help">Loading add-ons…</p> : addonError ? <p className="form-warning" role="alert">{addonError}</p> : addonOptions.length ? <div className="booking-addon-options">{addonOptions.map((item) => <label key={item.id} className={selectedAddonIds.includes(item.id) ? "is-selected" : ""}><input type="checkbox" checked={selectedAddonIds.includes(item.id)} onChange={(event) => toggleAddon(item.id, event.target.checked)} disabled={saving} /><span>{item.name}{item.archived ? " (previously selected)" : ""}</span><strong>₱{item.price.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong></label>)}</div> : <p className="workflow-help">No add-ons configured for this package.</p>}<small className="booking-addon-total">Add-ons total: ₱{addonTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</small></fieldset>
        {packageLoadError && <p className="form-warning" role="alert">{packageLoadError}</p>}
        {chosenPackage && <div className="workflow-callout"><strong>{chosenPackage.name}</strong><small>{chosenPackage.duration || "Duration not set"} · {chosenPackage.inclusions || "No inclusions listed"}</small>{recipeCost !== null && <small>Recipe cost: ₱{recipeCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })} · Estimated profit: ₱{(Number(total) - recipeCost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</small>}{packageChanged && <small>Package changed. Review the booking total below before saving.</small>}</div>}
        <label>Total<div className="money-input"><span>₱</span><input type="number" min={booking.paidAmount || 0} step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} required /></div></label>
        <div className="workflow-callout"><strong>Downpayment: ₱{Number(booking.downpaymentAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong><small>Remaining balance: ₱{Math.max(0,Number(total)-Number(booking.paidAmount || 0)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</small>Recorded payments: ₱{Number(booking.paidAmount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}<small>Payments are recorded in Collect payment or Cashflow. Completing an event requires full payment and does not create a receipt.</small></div>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as BookingRecord["status"])}><option value="PENDING">Pending</option><option value="DONE">Done</option><option value="CANCELLED">Cancelled</option></select></label>
      </div>{error && <p className="form-warning" role="alert">{error}</p>}</div></div>
      <div className="drawer-footer"><button className="secondary-button danger-button" type="button" onClick={() => void deleteBooking()} disabled={saving || deleteBusy}>{deleteBusy ? "Deleting…" : "Delete booking"}</button><button className="secondary-button" type="button" onClick={onClose} disabled={saving || deleteBusy}>Cancel</button><button className="primary-button" type="submit" disabled={saving || deleteBusy}>{saving ? "Saving…" : "Save changes"}</button></div>
    </form>
  </div>{overrideOpen && <div className="booking-overlay admin-override-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-override-title"><section className="admin-override-dialog"><button className="close-button" type="button" onClick={() => { setOverrideOpen(false); setAdminPassword(""); setDeleteError(""); }} disabled={deleteBusy} aria-label="Cancel permanent deletion"><X aria-hidden="true" /></button><div className="admin-override-icon"><MapPin aria-hidden="true" /></div><p className="eyebrow">Administrator authorization</p><h2 id="booking-override-title">Linked records will be deleted</h2><p>This permanently removes this booking’s payments, linked expenses, cash entries, calendar record, and usage history. Inventory used for this booking will be restored.</p><label>Admin password<input autoFocus type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void confirmOverride(); } }} aria-invalid={Boolean(deleteError)} /></label>{deleteError && <p className="form-warning" role="alert">{deleteError}</p>}<div className="admin-override-actions"><button className="secondary-button" type="button" onClick={() => { setOverrideOpen(false); setAdminPassword(""); setDeleteError(""); }} disabled={deleteBusy}>Keep booking</button><button className="app-dialog-danger-button" type="button" onClick={() => void confirmOverride()} disabled={deleteBusy || !adminPassword}>{deleteBusy ? "Verifying…" : "Verify & permanently delete"}</button></div></section></div>}</>;
}
