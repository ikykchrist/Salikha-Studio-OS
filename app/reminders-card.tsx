"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ListChecks, Plus, Trash2 } from "lucide-react";
import { showConfirm } from "../lib/ui-dialogs";
import styles from "./reminders-card.module.css";

type Reminder = { id: string; title: string; shared: boolean };

async function requestReminders(method = "GET", body?: object, archived = false) {
  const response = await fetch(archived ? "/api/reminders?view=archives" : "/api/reminders", {
    method, cache: "no-store",
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Reminders could not be saved.");
  return result;
}

export function RemindersCard({ isAdmin }: { isAdmin: boolean }) {
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [draftId, setDraftId] = useState("");
  const [title, setTitle] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState("");
  const [error, setError] = useState("");
  const version = useRef(0);
  const writing = useRef(false);
  const refresh = useCallback(async () => {
    if (writing.current || document.hidden) return;
    const snapshot = ++version.current;
    try {
      const result = await requestReminders("GET", undefined, archived);
      if (version.current === snapshot) { setItems(result.reminders); setError(""); }
    } catch {
      if (version.current === snapshot) setError("Could not load reminders.");
    }
  }, [archived]);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      ++version.current;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (writing.current || !title.trim()) return;
    writing.current = true;
    ++version.current;
    setBusy(true);
    setError("");
    try {
      const { reminder } = await requestReminders("POST", { id: draftId, title, shared });
      if (reminder) setItems(old => [reminder, ...(old ?? []).filter(row => row.id !== reminder.id)]);
      setDraftId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the to-do."); }
    finally { writing.current = false; setBusy(false); }
  }

  async function complete(id: string) {
    if (writing.current) return;
    writing.current = true;
    ++version.current;
    setBusy(true);
    setError("");
    try {
      await requestReminders("PATCH", { id });
      setLeaving(id);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise(resolve => window.setTimeout(resolve, 280));
      }
      setItems(old => old?.filter(row => row.id !== id) ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete the to-do."); }
    finally { writing.current = false; setLeaving(""); setBusy(false); }
  }

  function switchList(next: boolean) {
    if (next === archived || writing.current) return;
    ++version.current;
    setItems(null);
    setError("");
    setArchived(next);
  }

  async function deleteArchived(row?: Reminder) {
    if (writing.current || !isAdmin || !archived || !items?.length) return;
    const ids = row ? [row.id] : items.map(item => item.id);
    writing.current = true;
    ++version.current;
    setBusy(true);
    setError("");
    try {
      const confirmed = await showConfirm(row ? `Permanently delete “${row.title}”?` : `Permanently delete all ${ids.length} archived to-dos shown here?`, {
        title: row ? "Delete archived to-do?" : "Delete all archived to-dos?",
        confirmLabel: row ? "Delete" : "Delete all", danger: true,
      });
      if (!confirmed) return;
      await requestReminders("DELETE", { ids });
      const removed = new Set(ids);
      setItems(old => old?.filter(item => !removed.has(item.id)) ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete archived to-dos."); }
    finally { writing.current = false; setBusy(false); }
  }

  return <article className={`panel ${styles.card}`} aria-labelledby="reminders-heading">
    <div className="panel-heading"><h2 id="reminders-heading">Reminders</h2>
      {isAdmin && !archived && !draftId && <button className="secondary-button" type="button" disabled={busy} onClick={() => {
        setTitle(""); setShared(false); setDraftId(crypto.randomUUID());
      }}><Plus size={16} aria-hidden="true" /> Add To Do</button>}
    </div>
    <div className={styles.toolbar}>
      <div className={styles.tabs} role="tablist" aria-label="Reminder lists">
        {["To-dos", "Archives"].map((label, index) => {
          const archiveTab = index === 1;
          const selected = archiveTab === archived;
          return <button key={label} id={`reminders-tab-${index}`} type="button" role="tab" aria-selected={selected}
            aria-controls="reminders-list" tabIndex={selected ? 0 : -1} disabled={busy}
            onClick={() => switchList(archiveTab)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? false : event.key === "End" ? true : !archiveTab;
              switchList(next);
              document.getElementById(`reminders-tab-${Number(next)}`)?.focus();
            }}>{label}</button>;
        })}
      </div>
      {archived && isAdmin && Boolean(items?.length) && <button className={styles.delete} type="button" disabled={busy} onClick={() => void deleteArchived()}><Trash2 size={15} aria-hidden="true" /> Delete all</button>}
    </div>
    <div id="reminders-list" role="tabpanel" aria-labelledby={`reminders-tab-${Number(archived)}`}>
    {!archived && draftId && isAdmin && <form className={styles.form} onSubmit={save}>
      <label className={styles.title}>To-do<input autoFocus required maxLength={300} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
      <label className={styles.check}><input type="checkbox" checked={shared} disabled={busy} onChange={e => setShared(e.target.checked)} /> Share with members</label>
      <div className={styles.actions}><button className="primary-button" type="submit" disabled={busy || !title.trim()}>Save to-do</button>
        <button className="text-button" type="button" disabled={busy} onClick={() => setDraftId("")}>Cancel</button></div>
    </form>}
    {error && <div role="alert" className={styles.error}>{error} <button className="text-button" type="button" onClick={refresh}>Refresh list</button></div>}
    {items === null ? !error && <p className="workflow-help" role="status">Loading reminders…</p> : items.length ? <ul className={styles.list}>
      {items.map(row => <li className={archived ? styles.archived : row.id === leaving ? styles.leaving : undefined} key={row.id}>
        <label className={styles.check}><input type="checkbox" checked={archived || row.id === leaving} disabled={archived || busy} onChange={() => void complete(row.id)} />
          <span>{row.title}{isAdmin && <small>{row.shared ? "Shared with members" : "Admins only"}</small>}</span>
        </label>
        {archived && isAdmin && <button type="button" className={styles.delete} aria-label={`Delete ${row.title}`} disabled={busy} onClick={() => void deleteArchived(row)}><Trash2 size={16} aria-hidden="true" /></button>}
      </li>)}
    </ul> : <p className={styles.empty}>{archived ? <Archive aria-hidden="true" /> : <ListChecks aria-hidden="true" />}{archived ? "No archived to-dos." : isAdmin ? "No open to-dos." : "No shared to-dos."}</p>}
    </div>
  </article>;
}
