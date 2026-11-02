"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Database, KeyRound, Send, Sparkles } from "lucide-react";

type Message = { role: "user" | "model"; text: string };
type Setup = { configured: boolean; model?: string; source?: string; dailyLimit?: number };
const livePrompts = ["Ano ang cash balance at profit natin ngayong buwan?", "Aling bookings ang may unpaid balance?", "Anong inventory ang kailangan nang i-restock?", "Ano ang dapat ihanda para sa upcoming events?"];
const generalPrompts = ["Paano magkaiba ang cash balance at profit?", "Gumawa ng follow-up message para sa past client.", "Ano ang magandang event preparation checklist?", "Paano i-review ang inventory bago ang event?"];

export function AiAssistant() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("gemini-3.8-flash");
  const [liveData, setLiveData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asOf, setAsOf] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/assistant", { cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not check assistant setup.");
      if (active) { setSetup(result); setModel(result.model || "gemini-3.8-flash"); }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Could not check assistant setup."); });
    return () => { active = false; };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function configure(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !key.trim() || !model.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "configure", key: key.trim(), model: model.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not connect Gemini.");
      setSetup({ configured: true, model: result.model, source: "settings", dailyLimit: 30 }); setKey("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect Gemini."); }
    finally { setBusy(false); }
  }
  async function changeModel(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !model.trim() || model.trim() === setup?.model) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateModel", model: model.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not change model.");
      setSetup(current => current ? { ...current, model: result.model } : current);
      setMessages([]); setAsOf("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not change model."); }
    finally { setBusy(false); }
  }
  async function send(question = draft) {
    if (busy || !question.trim() || !setup?.configured) return;
    const next: Message[] = [...messages, { role: "user", text: question.trim() }];
    setBusy(true); setError(""); setDraft("");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, includeStudioData: liveData }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not get an answer.");
      setMessages([...next, { role: "model", text: result.text }]); setAsOf(result.dataAsOf || "");
    } catch (err) { setDraft(question); setError(err instanceof Error ? err.message : "Could not get an answer."); }
    finally { setBusy(false); }
  }
  return <section className="assistant-page">
    <div className="page-heading"><div><p className="eyebrow">Salikha Studio OS</p><h1>Studio assistant</h1><p className="subheading">Ask about your bookings, money, stock and next steps.</p></div><button className="secondary-button" type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setDraft(""); setError(""); setAsOf(""); }}>New chat</button></div>
    <div className="assistant-layout">
      <div className="assistant-chat panel">
        <div className="assistant-chat-top"><div className="assistant-avatar"><Bot aria-hidden="true" /></div><div><strong>Salikha assistant</strong><small>{setup?.configured ? `${setup.model} · Admin only` : "Gemini setup needed"}</small></div><span className="assistant-live-dot" aria-hidden="true" /></div>
        {!setup && !error && <p role="status" className="assistant-empty">Checking setup…</p>}
        {setup && !setup.configured && <div className="assistant-empty"><KeyRound aria-hidden="true" /><h2>Connect Gemini</h2><p>Save a Gemini API key and model ID below to start. Your key stays encrypted on the server.</p></div>}
        {setup?.configured && <div className="assistant-messages" role="log" aria-label="Assistant conversation" aria-live="polite">
          {!messages.length && <div className="assistant-empty"><Sparkles aria-hidden="true" /><h2>What can I help with?</h2><p>Choose a starting question or type your own. Live studio data is refreshed for each answer when enabled.</p><div className="assistant-prompts">{(liveData ? livePrompts : generalPrompts).map(prompt => <button key={prompt} type="button" onClick={() => void send(prompt)} disabled={busy}>{prompt}</button>)}</div></div>}
          {messages.map((message, index) => <div className={`assistant-message ${message.role === "user" ? "is-user" : "is-model"}`} key={index}><span>{message.role === "user" ? "You" : "Studio assistant"}</span><p>{message.text}</p></div>)}
          {busy && <div className="assistant-message is-model" role="status"><span>Studio assistant</span><p>Checking and preparing an answer…</p></div>}
          <div ref={endRef} />
        </div>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
        {setup?.configured && <form className="assistant-compose" onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor="assistant-question">Ask the assistant</label><textarea id="assistant-question" value={draft} maxLength={2000} rows={3} disabled={busy || messages.length >= 12} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask about upcoming bookings, cashflow or inventory…" /><div><small>{messages.length >= 12 ? "Start a new chat to continue." : asOf ? `Studio figures as of ${asOf} (Manila)` : "Answers never change your records."}</small><button className="primary-button" type="submit" disabled={busy || !draft.trim() || messages.length >= 12}><Send aria-hidden="true" /> Send</button></div></form>}
      </div>
      <aside className="assistant-sidebar">
        <div className="panel assistant-side-card"><div className="assistant-side-heading"><Database aria-hidden="true" /><h2>Studio data</h2></div><label className="assistant-toggle"><input type="checkbox" checked={liveData} onChange={event => setLiveData(event.target.checked)} /><span>Use current records</span></label><p>{liveData ? "Each question sends a fresh summary of bookings, this month's Reports figures and low stock to Google Gemini. Event names are included." : "General guidance only. No studio records are sent to Gemini."}</p><small>Your chat questions are sent to Google. This assistant cannot post payments, bookings or messages.</small></div>
        {setup && !setup.configured && <form className="panel assistant-side-card assistant-setup" onSubmit={configure}><div className="assistant-side-heading"><KeyRound aria-hidden="true" /><h2>Gemini setup</h2></div><label>API key<input type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" placeholder="Paste from Google AI Studio" /></label><label>Model ID<input value={model} onChange={event => setModel(event.target.value)} placeholder="Model ID from AI Studio" /></label><button className="primary-button" type="submit" disabled={busy || !key.trim() || !model.trim()}>{busy ? "Checking…" : "Connect Gemini"}</button><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Open Google AI Studio</a><small>Your Gemini app subscription and API access are separate.</small></form>}
        {setup?.configured && <form className="panel assistant-side-card assistant-setup" onSubmit={changeModel}><div className="assistant-side-heading"><Check aria-hidden="true" /><h2>Gemini model</h2></div><p>Reports figures follow the app's existing calculation. Review financial decisions in Reports and Cashflow.</p><label>Model ID<input value={model} onChange={event => setModel(event.target.value)} disabled={busy} /></label><button className="secondary-button" type="submit" disabled={busy || !model.trim() || model.trim() === setup.model}>{busy ? "Checking…" : "Change model"}</button><small>Try gemini-3.5-flash-lite if Flash is unavailable. Limit: {setup.dailyLimit || 30} questions per admin per day.</small></form>}
      </aside>
    </div>
  </section>;
}
