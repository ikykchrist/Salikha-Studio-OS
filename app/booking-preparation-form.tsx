"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

type Preparation = { layoutReady: boolean; venueReady: boolean; backdropColor: string | null };

export function BookingPreparationForm({ bookingName, preparation, onClose, onSave }: { bookingName: string; preparation: Preparation; onClose: () => void; onSave: (value: Preparation) => Promise<void> }) {
  const [layoutReady, setLayoutReady] = useState(preparation.layoutReady);
  const [venueReady, setVenueReady] = useState(preparation.venueReady);
  const [backdropColor, setBackdropColor] = useState(preparation.backdropColor || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ready = layoutReady && venueReady && Boolean(backdropColor.trim());
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ layoutReady, venueReady, backdropColor: backdropColor || null }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save preparation."); } finally { setSaving(false); } };
  return <div className="booking-overlay" role="dialog" aria-modal="true" aria-labelledby="preparation-title"><form className="booking-drawer preparation-drawer" onSubmit={submit}><div className="drawer-header"><div><p className="eyebrow">Admin / Booking preparation</p><h2 id="preparation-title">Prepare for deployment</h2><small>{bookingName}</small></div><button className="close-button" type="button" onClick={onClose} aria-label="Close booking preparation"><X aria-hidden="true" /></button></div><div className="drawer-body"><p className="subheading">Confirm event setup before dispatch. This checklist is saved with the booking.</p><fieldset className="preparation-checklist"><legend>Required checklist</legend><label><input type="checkbox" checked={layoutReady} onChange={event=>setLayoutReady(event.target.checked)}/><span><strong>Layout is ready</strong><small>Backdrop, booth, and equipment layout have been checked.</small></span></label><label><input type="checkbox" checked={venueReady} onChange={event=>setVenueReady(event.target.checked)}/><span><strong>Venue is ready</strong><small>Venue details, access, and setup area have been confirmed.</small></span></label><label className="backdrop-color-field"><span><strong>Backdrop color</strong><small>Type the color requested for this event (e.g. dusty rose, navy blue).</small></span><input className="backdrop-color-text" aria-label="Backdrop color" value={backdropColor} onChange={event=>setBackdropColor(event.target.value)} placeholder="Type a color name" maxLength={80}/></label></fieldset><div className={`preparation-state ${ready?"is-ready":"is-pending"}`} role="status"><i/><span><strong>{ready?"Ready for Deployment":"To Prepare"}</strong><small>{ready?"All required preparation checks are complete.":"Complete both checks and enter a backdrop color."}</small></span></div>{error&&<p className="form-warning" role="alert">{error}</p>}</div><div className="drawer-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving}><Check aria-hidden="true"/>{saving?"Saving…":"Save preparation"}</button></div></form></div>;
}
