"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Plus, Search, Users } from "lucide-react";
import { formatManilaDate } from "../lib/manila-datetime";
import { staffRoles, type StaffBooking, type StaffMember } from "../lib/staff-roster";
import { centeredStaffPhoto } from "../lib/staff-profile-photo";
import { StaffPhotoEditor, type StaffPhotoDraft } from "./staff-photo-editor";
import { money } from "../lib/workflow-validation";

type Roster = { staff: StaffMember[]; bookings: StaffBooking[] };

async function loadRoster(signal?: AbortSignal): Promise<Roster> {
  const response = await fetch("/api/staff", { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load the staff roster.");
  return data;
}

function staffPhotoUrl(staff: StaffMember) {
  return staff.photoVersion
    ? `/api/staff/photo?id=${encodeURIComponent(staff.id)}&v=${encodeURIComponent(staff.photoVersion)}`
    : null;
}

function StaffAvatar({ name, photo }: { name: string; photo: string | null }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  if (photo && photo !== failedPhoto) {
    return <img className="avatar roster-avatar" src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailedPhoto(photo)} />;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
  return <span className="avatar roster-avatar" aria-hidden="true">{initials}</span>;
}

export function StaffRoster() {
  const [roster, setRoster] = useState<Roster>();
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [query, setQuery] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [profilePhoto, setProfilePhoto] = useState<string | null>();
  const [photoDraft, setPhotoDraft] = useState<StaffPhotoDraft | null>(null);
  const [lastPhotoDraft, setLastPhotoDraft] = useState<StaffPhotoDraft | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadRoster(controller.signal).then(setRoster).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [retry]);

  const selected = roster?.staff.find(({ id }) => id === selectedId) ?? roster?.staff[0];
  const visibleStaff = roster?.staff.filter((staff) => `${staff.name} ${staff.assignment}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const assignedBookings = new Set(selected?.events.filter((event) => event.status !== "UNASSIGNED").map((event) => event.bookingId));
  const availableBookings = roster?.bookings.filter(({ id }) => !assignedBookings.has(id)) ?? [];
  const initial = editing === "edit" ? selected : undefined;
  const currentPhoto = initial ? staffPhotoUrl(initial) : null;
  const previewPhoto = profilePhoto === undefined ? currentPhoto : profilePhoto;
  const busy = saving || Boolean(photoDraft);

  function openProfile(mode: "new" | "edit") {
    setProfilePhoto(undefined);
    setLastPhotoDraft(null);
    setEditing(mode);
  }

  async function save(fields: Record<string, unknown>, success: string) {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your change.");
      if (data.id) setSelectedId(data.id);
      setEditing(null);
      if (fields.action === "assign") setBookingId("");
      setNotice(success);
      try {
        setRoster(await loadRoster());
      } catch {
        setError("Change saved. Refresh the roster to see the latest details.");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your change.");
    } finally {
      setSaving(false);
    }
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    void save({ ...Object.fromEntries(new FormData(event.currentTarget)), action: "profile", id: initial?.id, profilePhoto }, "Staff profile saved.");
  }

  return <>
    <section className="page-heading">
      <div><p className="eyebrow">Workspace / Staff</p><h1>Staff roster</h1><p className="subheading">Manage operators, event assignments, and payouts.</p></div>
      <button type="button" className="primary-button" disabled={busy || !roster} onClick={() => openProfile("new")}><Plus aria-hidden="true" /> Add staff</button>
    </section>
    {error && <div className="roster-feedback" role="alert">{error} <button className="secondary-button" type="button" onClick={() => { setError(""); setRetry((version) => version + 1); }}>Refresh roster</button></div>}
    {notice && <p className="roster-feedback" role="status">{notice}</p>}
    {!roster && !error && <p role="status">Loading staff roster…</p>}
    {roster && <div className="roster-layout">
      <section className="panel roster-directory" aria-label="Staff directory">
        <div className="panel-heading"><h2>Staff directory</h2><span className="count-badge">{roster.staff.length}</span></div>
        <div className="search-field"><Search aria-hidden="true" /><input aria-label="Search staff" placeholder="Search staff" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="staff-list">
          {visibleStaff.map((staff) => (
            <button type="button" className="staff-list-item" aria-pressed={staff.id === selected?.id} disabled={busy}
              key={staff.id} onClick={() => { setSelectedId(staff.id); setEditing(null); setBookingId(""); setNotice(""); }}>
              <StaffAvatar name={staff.name} photo={staffPhotoUrl(staff)} />
              <span><strong>{staff.name}</strong><small>{staff.assignment}</small></span>
            </button>
          ))}
          {!visibleStaff.length && <p>{roster.staff.length ? "No matching staff." : "No staff profiles yet."}</p>}
        </div>
      </section>

      <section className="panel roster-detail" aria-label="Staff profile">
        {editing ? <>
          <h2>{editing === "new" ? "Add staff" : "Edit staff profile"}</h2>
          <form className="team-create-form roster-profile-form" key={initial?.id ?? "new"} onSubmit={submitProfile}>
            <div className="roster-photo-field">
              <StaffAvatar name={initial?.name ?? ""} photo={previewPhoto} />
              <div>
                <label>Profile photo
                  <input type="file" accept="image/*" disabled={busy} onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) setPhotoDraft({ source: file, framing: centeredStaffPhoto });
                  }} />
                </label>
                {previewPhoto && <div className="roster-photo-links">
                  <button type="button" className="text-button" disabled={busy}
                    onClick={() => setPhotoDraft(lastPhotoDraft ?? { source: previewPhoto, framing: centeredStaffPhoto })}>Adjust framing</button>
                  <button type="button" className="text-button" disabled={busy}
                    onClick={() => { setProfilePhoto(null); setLastPhotoDraft(null); }}>Remove photo</button>
                </div>}
              </div>
            </div>
            <label>Full name<input name="name" defaultValue={initial?.name} required maxLength={120} /></label>
            <label>Assignment<select name="assignment" defaultValue={initial?.assignment ?? staffRoles[0]}>{staffRoles.map((role) => <option key={role}>{role}</option>)}</select></label>
            <label>Address<input name="address" defaultValue={initial?.address} maxLength={500} /></label>
            <label>Phone number<input name="phone" type="tel" defaultValue={initial?.phone} maxLength={40} /></label>
            <label>Email<input name="email" type="email" defaultValue={initial?.email} maxLength={254} /></label>
            <label>Facebook link<input name="facebookUrl" type="url" defaultValue={initial?.facebookUrl} maxLength={500} placeholder="https://www.facebook.com/…" /></label>
            <div className="roster-actions"><button type="submit" className="primary-button" disabled={busy}>Save profile</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        </> : selected ? <>
          <div className="panel-heading roster-profile-heading">
            <div className="roster-profile-name">
              <StaffAvatar name={selected.name} photo={staffPhotoUrl(selected)} />
              <div><h2>{selected.name}</h2><p>{selected.assignment}</p></div>
            </div>
            <button type="button" className="secondary-button" disabled={saving} onClick={() => openProfile("edit")}>Edit profile</button>
          </div>
          <dl className="roster-contact">
            <div><dt>Address</dt><dd>{selected.address || "—"}</dd></div>
            <div><dt>Phone number</dt><dd>{selected.phone || "—"}</dd></div>
            <div><dt>Email</dt><dd>{selected.email || "—"}</dd></div>
            <div><dt>Facebook</dt><dd>{selected.facebookUrl ? <a href={selected.facebookUrl} target="_blank" rel="noreferrer">Open profile <ExternalLink size={13} aria-hidden="true" /></a> : "—"}</dd></div>
          </dl>
          <div className="roster-metrics" aria-label="Staff totals">
            <div><span>Event count</span><strong>{selected.eventCount}</strong></div>
            <div><span>Upcoming events</span><strong>{selected.upcomingCount}</strong></div>
            <div><span>Total income received</span><strong>{money(Number(selected.totalReceived))}</strong></div>
          </div>

          <section className="roster-events">
            <h2>Event assignments</h2>
            <form className="roster-actions" onSubmit={(event) => {
              event.preventDefault();
              void save({ action: "assign", staffId: selected.id, bookingId }, "Event assigned.");
            }}>
              <label>Booking
                <select className="filter-select" value={bookingId} onChange={(event) => setBookingId(event.target.value)} required disabled={saving || !availableBookings.length}>
                  <option value="">{availableBookings.length ? "Choose a booking" : "No bookings available to assign"}</option>
                  {availableBookings.map((booking) => <option key={booking.id} value={booking.id}>{formatManilaDate(booking.eventDate)} · {booking.eventName}</option>)}
                </select>
              </label>
              <button type="submit" className="primary-button" disabled={!bookingId || saving}>Assign event</button>
            </form>
            {selected.events.length > 0 && <p>Enter the total this staff member has received for each event, including any partial payouts.</p>}
            {selected.events.length ? <ul className="roster-event-list">
              {selected.events.map((event) => (
                <li key={event.id}>
                  <div><strong>{event.eventName}</strong><small>{event.eventDate ? formatManilaDate(event.eventDate) : "Date TBA"} · {event.status === "REMOVED" ? "Booking removed" : event.status === "UNASSIGNED" ? "Assignment ended" : event.status.toLowerCase()}</small></div>
                  <form className="roster-actions" key={event.receivedAmount} onSubmit={(submit) => {
                    submit.preventDefault();
                    const receivedAmount = new FormData(submit.currentTarget).get("receivedAmount");
                    void save({ action: "payout", id: event.id, receivedAmount }, "Payout saved.");
                  }}>
                    <label>Received (₱)
                      <input name="receivedAmount" aria-label={`Received amount for ${event.eventName}`} defaultValue={event.receivedAmount} type="number" min="0" max="999999999.99" step="0.01" required disabled={saving} />
                    </label>
                    <button type="submit" className="secondary-button" disabled={saving}>Save payout</button>
                    {Number(event.receivedAmount) === 0 && <button type="button" className="text-button" disabled={saving} onClick={() => void save({ action: "unassign", id: event.id }, "Assignment removed.")}>Remove assignment</button>}
                  </form>
                </li>
              ))}
            </ul> : <p>No events assigned yet.</p>}
          </section>
        </> : <div className="empty-state"><div className="empty-mark"><Users aria-hidden="true" /></div><h3>Add your first staff member</h3><p>Profiles, assignments, and payouts will appear here.</p><button type="button" className="secondary-button" onClick={() => openProfile("new")}>Add staff</button></div>}
      </section>
    </div>}
    {photoDraft && <StaffPhotoEditor draft={photoDraft} onCancel={() => setPhotoDraft(null)} onApply={(photo, framing) => {
      setProfilePhoto(photo);
      setLastPhotoDraft({ source: photoDraft.source, framing });
      setPhotoDraft(null);
    }} />}
  </>;
}
