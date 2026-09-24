"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Check, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";

type Connection = { account_email: string; calendar_id: string; calendar_name: string; connected_at: string };
type CalendarOption = { id: string; name: string; primary: boolean };
type SyncHealth = { failed_count: number; last_synced_at: string | null; last_error: string | null };

export function GoogleCalendarControls() {
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/google-calendar", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not check the Google Calendar connection.");
    setConfigured(Boolean(result.configured));
    setConnection((previous) => {
      const next = result.connection as Connection | null;
      return previous && next && previous.account_email === next.account_email && previous.calendar_id === next.calendar_id && previous.calendar_name === next.calendar_name ? previous : next;
    });
    setSyncHealth(result.sync || null);
    if (result.connection) setCalendarId(result.connection.calendar_id);
    return result.connection as Connection | null;
  }, []);
  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Calendar status unavailable.")); }, [refresh]);
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    void fetch("/api/google-calendar/calendars", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load Google calendars.");
      if (!cancelled) setCalendars(result.calendars || []);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load calendars."); });
    return () => { cancelled = true; };
  }, [connection]);
  useEffect(() => { if (connection) void fetch("/api/google-calendar/sync", { method: "POST" }).catch(() => undefined); }, [connection]);
  const sync = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/google-calendar/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok && response.status !== 207) throw new Error(result.error || "Calendar synchronization failed.");
      const successText = result.synced + " event(s) synced" + (result.removed ? ", " + result.removed + " removed" : "");
      if (result.failed?.length) { setError(successText + "; " + result.failed.length + " booking(s) need attention. Open Calendar sync status in Settings."); }
      else setMessage(successText + ".");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Calendar synchronization failed."); }
    finally { setBusy(false); }
  };
  const chooseCalendar = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCalendarId(event.target.value); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/google-calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ calendarId: event.target.value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not select that calendar.");
      await refresh(); setMessage("Target calendar saved.");
      await sync();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not select that calendar."); }
    finally { setBusy(false); }
  };
  return <section className="calendar-status">
    <div className="calendar-status-icon"><CalendarRange aria-hidden="true" /></div>
    <div className="google-calendar-copy"><strong>{connection ? "Google Calendar connected" : configured ? "Google Calendar is ready to connect" : "Google Calendar needs OAuth setup"}</strong><span>{connection ? connection.account_email + " · " + connection.calendar_name : configured ? "Connect the studio Google account to enable booking sync." : "Complete Google OAuth setup in Settings to enable booking sync."}</span>
      {connection && <div className="google-calendar-target"><label htmlFor="google-calendar-target">Target calendar</label><select id="google-calendar-target" value={calendarId} onChange={(event) => void chooseCalendar(event)} disabled={busy}>{calendars.map((item) => <option key={item.id} value={item.id}>{item.name}{item.primary ? " · Primary" : ""}</option>)}</select></div>}
      {connection && <small className={syncHealth?.failed_count ? "google-calendar-error" : "google-calendar-message"} role="status">{syncHealth?.failed_count ? syncHealth.failed_count + " pending event(s) failed sync · " + (syncHealth.last_error || "retry with Sync now") : "Sync health: healthy"}{syncHealth?.last_synced_at ? " · Last sync " + new Date(syncHealth.last_synced_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : ""}</small>}
      {message && <small className="google-calendar-message" role="status"><Check aria-hidden="true" />{message}</small>}{error && <small className="google-calendar-error" role="alert">{error}</small>}
    </div>
    {connection ? <button className="secondary-button" type="button" onClick={() => void sync()} disabled={busy}>{busy ? <LoaderCircle className="recipe-spinner" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}{busy ? "Syncing…" : "Sync now"}</button> : configured ? <a className="primary-button" href="/api/google-calendar/connect"><ExternalLink aria-hidden="true" /> Connect Google account</a> : <button className="secondary-button" type="button" onClick={() => { window.localStorage.setItem("salikha-active-view", "Settings"); window.location.reload(); }}>Set up in Settings</button>}
  </section>;
}
