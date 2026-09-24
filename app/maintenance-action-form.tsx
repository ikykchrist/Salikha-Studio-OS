"use client";

import { useState } from "react";
import { X } from "lucide-react";

type MaintenanceRecord = { id: string; scheduled_date: string; completed_date: string | null; action_type: string; cost: number; vendor: string; notes: string | null };

export function MaintenanceActionForm({ equipmentId, equipmentName, onClose, onSave }: { equipmentId: string; equipmentName: string; onClose: () => void; onSave: (record: MaintenanceRecord) => void | Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [actionType, setActionType] = useState("Maintenance");
  const [scheduledDate, setScheduledDate] = useState(today);
  const [completedDate, setCompletedDate] = useState("");
  const [cost, setCost] = useState("0");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const record = {
      id: crypto.randomUUID(),
      scheduled_date: scheduledDate,
      completed_date: completedDate || null,
      action_type: actionType,
      cost: Number(cost) || 0,
      vendor,
      notes,
    };
    setSaving(true);
    setError("");
    try {
      const database = (await import("../lib/local-database")).getLocalDatabase();
      if (!database) throw new Error("Local database is unavailable.");
      const result = await database.from("equipment_maintenance").insert({
        equipment_id: equipmentId,
        scheduled_date: scheduledDate,
        completed_date: completedDate || null,
        action_type: actionType,
        cost: Number(cost) || 0,
        vendor,
        notes: notes || null,
      }).select("id").single();
      if (result.error || !result.data) throw new Error(result.error?.message || "Maintenance record was not saved.");
      await onSave({ ...record, id: result.data.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Maintenance record was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="booking-overlay" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">
      <div className="calendar-setup-dialog">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Equipment maintenance</p>
            <h2 id="maintenance-title">Add maintenance action</h2>
            <small>{equipmentName}</small>
          </div>
          {error && <p className="form-warning" role="alert">{error}</p>}
          <button className="close-button" type="button" onClick={onClose} aria-label="Close maintenance form"><X aria-hidden="true" /></button>
        </div>
        <div className="calendar-setup-body">
          <div className="form-grid">
            <label>Action type
              <select value={actionType} onChange={(event) => setActionType(event.target.value)}>
                <option>Maintenance</option>
                <option>Repair</option>
                <option>Cleaning</option>
                <option>Inspection</option>
                <option>Calibration</option>
              </select>
            </label>
            <label>Scheduled date<input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label>
            <label>Completed date<input type="date" value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /></label>
            <label>Cost<div className="money-input"><span>₱</span><input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" /></div></label>
            <label>Vendor<input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Service provider" /></label>
            <label className="wide-field">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="What was done?" /></label>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save maintenance"}</button>
        </div>
      </div>
    </div>
  );
}

export type { MaintenanceRecord };
