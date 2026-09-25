"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { deleteRecord } from "../lib/delete-record";

type BookingRecord = { id: string; client: string; eventName: string; date: string; startTime: string; endTime: string; venue: string; mapsUrl?: string; packageName: string; total: number; paidAmount?: number; downpaymentAmount?: number; status: "PENDING" | "DONE" | "CANCELLED"; preparation: { layoutReady: boolean; venueReady: boolean; backdropColor: string | null } };

export function BookingEditForm({ booking, onClose, onSave }: { booking: BookingRecord; onClose: () => void; onSave: (booking: BookingRecord) => void | Promise<void> }) {
  const [eventName, setEventName] = useState(booking.eventName);
  const [date, setDate] = useState(booking.date);
  const [startTime, setStartTime] = useState(booking.startTime);
  const [endTime, setEndTime] = useState(booking.endTime);
  const [venue, setVenue] = useState(booking.venue);
  const [mapsUrl, setMapsUrl] = useState(booking.mapsUrl || "");
  const [packageName, setPackageName] = useState(booking.packageName);
  const [total, setTotal] = useState(String(booking.total));
  const [downpayment, setDownpayment] = useState(String(booking.downpaymentAmount || 0));
  const [status, setStatus] = useState(booking.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!eventName.trim() || !date || Number(total) < 0 || Number(downpayment) < 0 || Number(downpayment) > Number(total)) return;
    setSaving(true);
    try { await onSave({ ...booking, eventName: eventName.trim(), date, startTime, endTime, venue: venue.trim(), mapsUrl: mapsUrl.trim(), packageName: packageName.trim(), total: Number(total), downpaymentAmount: Number(downpayment), status }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save booking."); }
    finally { setSaving(false); }
  };

  return <div className="booking-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-edit-title">
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
        <label>Package<input value={packageName} onChange={(event) => setPackageName(event.target.value)} /></label>
        <label>Total<div className="money-input"><span>₱</span><input value={total} onChange={(event) => setTotal(event.target.value)} inputMode="decimal" required /></div></label>
        <label>Downpayment<div className="money-input"><span>₱</span><input value={downpayment} onChange={(event) => setDownpayment(event.target.value)} type="number" min="0" max={Number(total)} step="0.01" /></div><small>Pending balance: ₱{Math.max(0, Number(total) - Number(downpayment || 0)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</small></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as BookingRecord["status"])}><option value="PENDING">Pending</option><option value="DONE">Done</option><option value="CANCELLED">Cancelled</option></select></label>
      </div>{error && <p className="form-warning" role="alert">{error}</p>}</div></div>
      <div className="drawer-footer"><button className="secondary-button danger-button" type="button" onClick={() => { if (window.confirm("Delete this booking? This cannot be undone.")) void deleteRecord("bookings", booking.id, "salikha-bookings"); }} disabled={saving}>Delete booking</button><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
    </form>
  </div>;
}
