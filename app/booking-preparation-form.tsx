"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { preparationReady, preparationProgress, type Preparation } from "../lib/booking-preparation";
import type { OperatorOption } from "../lib/staff-schedule";
import { WarningNotice } from "../lib/ui-dialogs";

type OperatorChoices = {
  operators: OperatorOption[];
  scheduledDate: string | null;
  canAssign: boolean;
  assigned: OperatorOption[];
  legacyName: string | null;
};

export function BookingPreparationForm({ bookingId, bookingName, preparation, onClose, onSave }: {
  bookingId: string;
  bookingName: string;
  preparation: Preparation;
  onClose: () => void;
  onSave: (value: Preparation) => Promise<void>;
}) {
  const [layoutReady, setLayoutReady] = useState(preparation.layoutReady);
  const [venueReady, setVenueReady] = useState(preparation.venueReady);
  const [backdropColor, setBackdropColor] = useState(preparation.backdropColor || "");
  const [suppliesPacked, setSuppliesPacked] = useState(preparation.suppliesPacked ?? false);
  const [equipmentChecked, setEquipmentChecked] = useState(preparation.equipmentChecked ?? false);
  const [choices, setChoices] = useState<OperatorChoices>();
  const [selection, setSelection] = useState<string[]>();
  const [choicesError, setChoicesError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/booking-preparation?bookingId=${encodeURIComponent(bookingId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load available operators.");
        if (!controller.signal.aborted) setChoices(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setChoicesError("Could not load available operators.");
      });
    return () => controller.abort();
  }, [bookingId, revision]);

  const operators = choices?.operators ?? [];
  const assigned = choices?.assigned ?? [];
  const selectedIds = selection ?? (choices ? assigned.map(({ id }) => id) : preparation.operatorIds ?? []);
  const selected = selectedIds.map((id) => assigned.find((operator) => operator.id === id) ?? operators.find((operator) => operator.id === id))
    .filter((operator): operator is OperatorOption => Boolean(operator));
  const legacyName = selection === undefined ? choices?.legacyName : null;
  const available = operators.filter(({ id }) => !selectedIds.includes(id));
  const operatorName = choices ? selected.map(({ name }) => name).join(", ") || legacyName : preparation.operatorName;
  const current = {
    layoutReady, venueReady, backdropColor: backdropColor || null, suppliesPacked, equipmentChecked,
    operatorName, operatorIds: selection,
  };
  const ready = preparationReady(current);
  const canChoose = Boolean(choices?.scheduledDate && choices.canAssign);

  let operatorHint = "Add available roster staff for this event.";
  if (!choices) operatorHint = choicesError || "Checking staff availability…";
  else if (!choices.scheduledDate) operatorHint = "Set the event date to see available operators.";
  else if (!choices.canAssign) operatorHint = "Operator assignment is closed for this booking.";
  else if (!available.length) operatorHint = "No more roster staff are available for this date.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save preparation.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="booking-overlay" role="dialog" aria-modal="true" aria-labelledby="preparation-title">
    <form className="booking-drawer preparation-drawer" onSubmit={submit}>
      <div className="drawer-header">
        <div><p className="eyebrow">Admin / Booking preparation</p><h2 id="preparation-title">Prepare for deployment</h2><small>{bookingName}</small></div>
        <button className="close-button" type="button" onClick={onClose} disabled={saving} aria-label="Close booking preparation"><X aria-hidden="true" /></button>
      </div>
      <div className="drawer-body">
        <p className="subheading">Confirm event setup before dispatch. This checklist is saved with the booking.</p>
        <fieldset className="preparation-checklist">
          <legend>Required checklist</legend>
          <label><input type="checkbox" checked={layoutReady} onChange={(event) => setLayoutReady(event.target.checked)} /><span><strong>Layout is ready</strong><small>Backdrop, booth, and equipment layout have been checked.</small></span></label>
          <label><input type="checkbox" checked={venueReady} onChange={(event) => setVenueReady(event.target.checked)} /><span><strong>Venue is ready</strong><small>Venue details, access, and setup area have been confirmed.</small></span></label>
          <label><input type="checkbox" checked={suppliesPacked} onChange={(event) => setSuppliesPacked(event.target.checked)} /><span><strong>Supplies packed</strong><small>Paper, ink, frames, and other event supplies are packed.</small></span></label>
          <label><input type="checkbox" checked={equipmentChecked} onChange={(event) => setEquipmentChecked(event.target.checked)} /><span><strong>Equipment checked</strong><small>Test cameras, printer, lights, cables, and backup equipment.</small></span></label>
          <div className="preparation-operators">
            <label className="backdrop-color-field">
              <span><strong>Assigned operators</strong><small id="operator-hint">{operatorHint}</small></span>
              <select className="backdrop-color-text" aria-label="Add an operator" aria-describedby="operator-hint"
                value="" disabled={!canChoose || !available.length || saving} onChange={(event) => {
                  if (event.target.value) setSelection([...selectedIds, event.target.value]);
                }}>
                <option value="">Add an operator</option>
                {available.map((operator) => <option key={operator.id} value={operator.id}>{operator.name} · {operator.assignment}</option>)}
              </select>
            </label>
            {(selected.length > 0 || legacyName) && <ul aria-label="Selected operators" className="preparation-operator-list">
              {selected.map((operator) => <li key={operator.id}>
                <span>{operator.name}</span>
                <button type="button" disabled={saving} aria-label={`Remove ${operator.name}`}
                  onClick={() => setSelection(selectedIds.filter((id) => id !== operator.id))}><X aria-hidden="true" size={13} /></button>
              </li>)}
              {legacyName && <li><span>{legacyName} (existing name)</span>
                <button type="button" disabled={saving} aria-label={`Remove ${legacyName}`} onClick={() => setSelection([])}><X aria-hidden="true" size={13} /></button>
              </li>}
            </ul>}
          </div>
          {choicesError && <button className="text-button" type="button" onClick={() => { setChoicesError(""); setRevision((value) => value + 1); }}>Retry staff availability</button>}
          <label className="backdrop-color-field">
            <span><strong>Backdrop color</strong><small>Type the color requested for this event (e.g. dusty rose, navy blue).</small></span>
            <input className="backdrop-color-text" aria-label="Backdrop color" value={backdropColor}
              onChange={(event) => setBackdropColor(event.target.value)} placeholder="Type a color name" maxLength={80} />
          </label>
        </fieldset>
        <div className={`preparation-state ${ready ? "is-ready" : "is-pending"}`} role="status">
          <i /><span><strong>{ready ? "Ready for Deployment" : `${preparationProgress(current)} / 6 ready`}</strong>
            <small>{ready ? "All required preparation checks are complete." : "Complete the checklist, assign operators, and confirm the backdrop color."}</small></span>
        </div>
        {error && <WarningNotice>{error}</WarningNotice>}
      </div>
      <div className="drawer-footer">
        <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="primary-button" type="submit" disabled={saving}><Check aria-hidden="true" />{saving ? "Saving…" : "Save preparation"}</button>
      </div>
    </form>
  </div>;
}
