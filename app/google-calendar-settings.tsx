"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Check, ExternalLink, Save } from "lucide-react";

export function GoogleCalendarSettings() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/google-calendar/config", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/google-calendar", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([config, status]) => {
      if (cancelled) return;
      if (config.error) throw new Error(config.error);
      setClientId(config.clientId || "");
      setConfigured(Boolean(config.configured)); setRedirectUri(config.redirectUri);
      setConnected(Boolean(status.connected)); setAccount(status.connection?.account_email || "");
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load Google Calendar settings."); });
    return () => { cancelled = true; };
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/google-calendar/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Google Calendar settings were not saved.");
      setConfigured(true); setRedirectUri(result.redirectUri); setClientSecret(""); setNotice("OAuth settings saved locally. You can connect your Google account.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Google Calendar settings were not saved."); }
    finally { setSaving(false); }
  };

  return <article className="settings-card google-oauth-settings">
    <div className="settings-card-icon"><CalendarRange aria-hidden="true" /></div>
    <div><p className="eyebrow">Integration setup</p><h2>Google Calendar</h2><p>{connected ? "Connected account: " + account : "Enter your OAuth web-client details here. The client secret is stored only in the local ignored config file and never returned to the browser."}</p></div>
    <span className={"settings-status " + (connected ? "ready" : configured ? "ready" : "pending")}>{connected ? "Connected" : configured ? "Credentials saved" : "Setup required"}</span>
    <form className="google-oauth-form" onSubmit={save}>
      <label>OAuth client ID<input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={configured ? "Enter to replace saved client ID" : "…apps.googleusercontent.com"} autoComplete="off" required /></label>
      <label>OAuth client secret<input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={configured ? "Saved securely · leave blank to keep current" : "Paste client secret"} autoComplete="new-password" required={!configured} /></label>
      <label className="wide-field">Authorized redirect URI (add this exact URL in Google Cloud)<input value={redirectUri || (typeof window !== "undefined" ? window.location.origin + "/api/google-calendar/callback" : "")} readOnly /></label>
      <small className="google-oauth-help">Google Cloud Console → enable Google Calendar API → OAuth consent screen → add your Google account as a test user → OAuth Client → Authorized redirect URIs.</small>
      {error && <p className="form-warning google-oauth-feedback" role="alert">{error}</p>}{notice && <p className="google-calendar-message google-oauth-feedback" role="status"><Check aria-hidden="true" />{notice}</p>}
      <div className="google-oauth-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : <><Save aria-hidden="true" /> Save OAuth settings</>}</button>{configured && <a className="secondary-button" href="/api/google-calendar/connect"><ExternalLink aria-hidden="true" /> {connected ? "Reconnect Google account" : "Connect Google account"}</a>}</div>
    </form>
  </article>;
}
