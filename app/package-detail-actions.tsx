"use client";

import { useState } from "react";
import { Archive, ArrowRight, Copy, Plus, X } from "lucide-react";
import { PackageEditForm } from "./package-edit-form";
import { PackageRecipeManager } from "./package-recipe-manager";
import { PackageAddonManager } from "./package-addon-manager";
import { deleteRecord } from "../lib/delete-record";
import { PackageProfitabilityCalculator } from "./package-profitability-calculator";
import { showConfirm } from "../lib/ui-dialogs";

type PackageRecord = { id: string; name: string; description: string; basePrice: number; duration: string; inclusions: string; notes: string; calendarColor?: string; active: boolean };

export function PackageDetailActions({ packageItem, onClose, onNavigate: _onNavigate, onCreateBooking, onSave, onDuplicate }: { packageItem: PackageRecord; onClose: () => void; onNavigate: (view: string) => void; onCreateBooking: () => void; onSave: (item: PackageRecord) => void | Promise<void>; onDuplicate: (item: PackageRecord) => void | Promise<void> }) {
  const [active, setActive] = useState(packageItem.active);
  const [showEdit, setShowEdit] = useState(false);
  const duplicate = () => { void onDuplicate({ ...packageItem, id: crypto.randomUUID(), name: `${packageItem.name} Copy`, active: true }); };
  return <><aside className="package-detail panel">
    <div className="detail-top"><button className="close-button" type="button" onClick={onClose} aria-label="Close package detail"><X aria-hidden="true" /></button><button className="detail-edit" type="button" onClick={() => setShowEdit(true)}><span aria-hidden="true">✎</span> Edit</button></div>
    <div className="package-detail-title"><p className="eyebrow">Package detail</p><h2>{packageItem.name}</h2><p>{packageItem.description || "No description added."}</p></div>
    <div className="package-price"><small>Base price</small><strong>₱{packageItem.basePrice.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</strong><span>Booking price can be overridden per event.</span></div>
    <div className="package-detail-info"><div><small>Duration</small><strong>{packageItem.duration || "Not specified"}</strong></div><div><small>Status</small><strong>{active ? "Active" : "Inactive"}</strong></div></div>
    <div className="package-detail-section"><p className="eyebrow">Included services</p><p className="package-copy">{packageItem.inclusions || "No inclusions added yet."}</p></div>
    <PackageRecipeManager packageId={packageItem.id} packageName={packageItem.name} />
    <PackageAddonManager packageId={packageItem.id} />
    <PackageProfitabilityCalculator packageId={packageItem.id} basePrice={packageItem.basePrice} />
    <div className="package-detail-actions"><button className="secondary-button" type="button" onClick={duplicate}><Copy aria-hidden="true" /> Duplicate</button><button className="secondary-button" type="button" onClick={() => { const updated = { ...packageItem, active: false }; setActive(false); void onSave(updated); }} disabled={!active}><Archive aria-hidden="true" /> {active ? "Archive" : "Archived"}</button><button className="secondary-button danger-button" type="button" onClick={async () => { if (await showConfirm("Delete this package? This cannot be undone.", { title: "Delete package", confirmLabel: "Delete package", danger: true })) await deleteRecord("service_packages", packageItem.id, "salikha-packages"); }}>Delete package</button><button className="primary-button" type="button" onClick={onCreateBooking}><Plus aria-hidden="true" /> Create booking <ArrowRight aria-hidden="true" /></button></div>
  </aside>{showEdit && <PackageEditForm initial={packageItem} onClose={() => setShowEdit(false)} onSave={async (updated) => { await onSave(updated); setShowEdit(false); }} />}</>;
}
