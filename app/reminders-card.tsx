"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ListChecks, Plus } from "lucide-react";
import styles from "./reminders-card.module.css";

type Reminder = { id: string; title: string; shared: boolean };

async function requestReminders(method = "GET", body?: object) {
  const response = await fetch("/api/reminders", {
    method, cache: "no-store",
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Reminders could not be saved.");
  return result;
}

export function RemindersCard({ isAdmin }: { isAdmin: boolean }) {
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
      const result = await requestReminders();
      if (version.current === snapshot) { setItems(result.reminders); setError(""); }
    } catch {
      if (version.current === snapshot) setError("Could not load reminders.");
    }
  }, []);
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

  return <article className={`panel ${styles.card}`} aria-labelledby="reminders-heading">
    <div className="panel-heading"><h2 id="reminders-heading">Reminders</h2>
      {isAdmin && !draftId && <button className="secondary-button" type="button" disabled={busy} onClick={() => {
        setTitle(""); setShared(false); setDraftId(crypto.randomUUID());
      }}><Plus size={16} aria-hidden="true" /> Add To Do</button>}
    </div>
    {draftId && isAdmin && <form className={styles.form} onSubmit={save}>
      <label className={styles.title}>To-do<input autoFocus required maxLength={300} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
      <label className={styles.check}><input type="checkbox" checked={shared} disabled={busy} onChange={e => setShared(e.target.checked)} /> Share with members</label>
      <div className={styles.actions}><button className="primary-button" type="submit" disabled={busy || !title.trim()}>Save to-do</button>
        <button className="text-button" type="button" disabled={busy} onClick={() => setDraftId("")}>Cancel</button></div>
    </form>}
    {error && <div role="alert" className={styles.error}>{error} <button className="text-button" type="button" onClick={refresh}>Refresh list</button></div>}
    {items === null ? !error && <p className="workflow-help" role="status">Loading reminders…</p> : items.length ? <ul className={styles.list}>
      {items.map(row => <li className={row.id === leaving ? styles.leaving : undefined} key={row.id}>
        <label className={styles.check}><input type="checkbox" checked={row.id === leaving} disabled={busy} onChange={() => void complete(row.id)} />
          <span>{row.title}{isAdmin && <small>{row.shared ? "Shared with members" : "Admins only"}</small>}</span>
        </label>
      </li>)}
    </ul> : <p className={styles.empty}><ListChecks aria-hidden="true" />{isAdmin ? "No open to-dos." : "No shared to-dos."}</p>}
  </article>;
}
