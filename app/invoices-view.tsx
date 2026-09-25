"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ImagePlus, Mail, Plus, Printer, Receipt, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { showConfirm, showNotice } from "../lib/ui-dialogs";

type InvoiceLine = { description: string; quantity: number; unitPrice: number };
type Booking = { id: string; client_id: string; event_name: string; event_date: string; start_time: string | null; end_time: string | null; venue: string | null; total_amount: number; downpayment_amount: number; paid_amount: number; status: string; client_name: string; client_email: string | null; package_name: string | null };
type BookingDetails = { eventName?: string | null; packageName?: string | null; eventDate?: string | null; startTime?: string | null; endTime?: string | null; venue?: string | null };
type Invoice = { id: string; invoice_number: string; client_id: string; booking_id: string | null; issue_date: string; due_date: string | null; status: "DRAFT" | "SENT" | "PAID" | "VOID"; line_items: InvoiceLine[]; booking_details: BookingDetails; subtotal: number; discount_amount: number; tax_rate: number; tax_amount: number; total_amount: number; notes: string | null; terms: string | null; email_sent_to: string | null; sent_at: string | null; client_name: string; client_email: string | null; event_name: string | null; event_date: string | null; start_time: string | null; end_time: string | null; venue: string | null; package_name: string | null; booking_paid: number | null };
const peso = (value: number) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date); };
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "—";
const timeLabel = (value: string | null | undefined) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) : "—";

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [emailReady, setEmailReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [search, setSearch] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/invoices", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invoices could not be loaded.");
      setInvoices(result.invoices as Invoice[]);
      setBookings(result.bookings as Booking[]);
      setLogoDataUrl(result.logoDataUrl ?? null);
      setEmailReady(Boolean(result.emailReady));
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Invoices could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);

  const visible = useMemo(() => invoices.filter((invoice) => `${invoice.invoice_number} ${invoice.client_name} ${invoice.event_name || ""}`.toLowerCase().includes(search.toLowerCase())), [invoices, search]);
  const selected = visible.find((invoice) => invoice.id === selectedId) || invoices.find((invoice) => invoice.id === selectedId) || null;
  const outstanding = invoices.filter((invoice) => invoice.status === "SENT").reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.booking_paid || 0)), 0);
  const statusOf = (invoice: Invoice) => invoice.status === "SENT" && invoice.booking_id && Number(invoice.booking_paid || 0) >= Number(invoice.total_amount) ? "PAID" : invoice.status === "SENT" && invoice.due_date && invoice.due_date < today() ? "OVERDUE" : invoice.status;
  const saveLogo = async (logo: string | null) => {
    setLogoBusy(true);
    try {
      const response = await fetch("/api/invoices/branding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logoDataUrl: logo }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Logo could not be saved.");
      setLogoDataUrl(result.logoDataUrl);
      await showNotice(logo ? "This logo is now saved in the studio database and will be used on invoices." : "The saved invoice logo has been removed.", logo ? "Invoice logo saved" : "Logo removed");
    } catch (error) { await showNotice(error instanceof Error ? error.message : "Logo could not be saved.", "Branding not saved"); }
    finally { setLogoBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png" || file.size > 1024 * 1024) { await showNotice("Choose a PNG logo no larger than 1 MB.", "Unsupported logo"); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") void saveLogo(reader.result); };
    reader.onerror = () => void showNotice("The selected PNG could not be read.", "Logo upload failed");
    reader.readAsDataURL(file);
  };

  const send = async (invoice: Invoice) => {
    if (!invoice.client_email) { await showNotice("Add an email address to the client record before sending this invoice.", "Client email needed"); return; }
    if (!emailReady) { await showNotice("Set RESEND_API_KEY and INVOICE_FROM_EMAIL on the server, then restart the app.", "Email setup required"); return; }
    if (!await showConfirm(`Send invoice ${invoice.invoice_number} to ${invoice.client_email}?`, { title: "Send invoice", confirmLabel: "Send invoice" })) return;
    setWorkingId(invoice.id);
    try { const response = await fetch("/api/invoices/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invoice.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice email could not be sent."); await showNotice(`${invoice.invoice_number} was sent to ${result.sentTo}.`, "Invoice sent"); await reload(); }
    catch (error) { await showNotice(error instanceof Error ? error.message : "Invoice email could not be sent.", "Could not send invoice"); }
    finally { setWorkingId(""); }
  };
  const voidInvoice = async (invoice: Invoice) => {
    if (!await showConfirm(`Void invoice ${invoice.invoice_number}? This keeps its audit record but marks it unusable.`, { title: "Void invoice", confirmLabel: "Void invoice", danger: true })) return;
    setWorkingId(invoice.id);
    try { const response = await fetch("/api/invoices", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invoice.id, status: "VOID" }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice could not be voided."); await showNotice(`${invoice.invoice_number} is now void.`, "Invoice voided"); await reload(); }
    catch (error) { await showNotice(error instanceof Error ? error.message : "Invoice could not be voided.", "Could not void invoice"); }
    finally { setWorkingId(""); }
  };

  return <>
    <section className="page-heading"><div><p className="eyebrow">Finance / Receivables</p><h1>Invoices</h1><p className="subheading">Generate accurate invoices directly from bookings, then send or print them.</p></div><button className="primary-button" type="button" onClick={() => setFormOpen(true)} disabled={!bookings.length}><Plus aria-hidden="true" /> New invoice</button></section>
    <section className="invoice-branding panel"><div className="invoice-branding-copy"><span className="eyebrow">Invoice branding</span><strong>{logoDataUrl ? "Your saved logo is active" : "Use your studio logo on every invoice"}</strong><small>PNG · Maximum 1 MB · stored in the studio database</small></div>{logoDataUrl && <img className="invoice-branding-preview" src={logoDataUrl} alt="Saved invoice logo preview" />}{logoDataUrl && <button className="secondary-button" type="button" disabled={logoBusy} onClick={() => void saveLogo(null)}><Trash2 aria-hidden="true" /> Remove</button>}<input ref={fileRef} type="file" accept="image/png,.png" hidden onChange={(event) => void uploadLogo(event.target.files?.[0])} /><button className="secondary-button" type="button" disabled={logoBusy} onClick={() => fileRef.current?.click()}><ImagePlus aria-hidden="true" />{logoBusy ? "Saving…" : logoDataUrl ? "Change logo" : "Upload PNG logo"}</button></section>
    <section className="invoice-metrics"><article className="metric-card"><span>Total invoices</span><strong>{invoices.length}</strong><small>Saved in this workspace</small></article><article className="metric-card"><span>Drafts</span><strong>{invoices.filter((invoice) => invoice.status === "DRAFT").length}</strong><small>Ready for review</small></article><article className="metric-card"><span>Sent and outstanding</span><strong>{peso(outstanding)}</strong><small>Linked booking payments reflected</small></article><article className="metric-card"><span>Overdue</span><strong>{invoices.filter((invoice) => statusOf(invoice) === "OVERDUE").length}</strong><small>Past the due date</small></article></section>
    {!emailReady && <div className="invoice-email-setup"><Mail aria-hidden="true" /><span><strong>Email sending needs setup.</strong> Configure <code>RESEND_API_KEY</code> and <code>INVOICE_FROM_EMAIL</code> on the app server. Creation, logo saving, and printing work independently.</span></div>}
    {loadError && <p className="form-warning" role="alert">{loadError}</p>}
    <section className="invoice-workspace"><div className="invoice-register panel"><div className="panel-heading"><div><p className="eyebrow">Invoice register</p><h2>All invoices</h2></div><span className="muted-label">{visible.length} records</span></div><label className="invoice-search"><span className="sr-only">Search invoices</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, client, or event" /></label>
      {loading ? <div className="invoice-empty">Loading invoices…</div> : visible.length === 0 ? <div className="invoice-empty"><span className="empty-mark"><Receipt aria-hidden="true" /></span><h3>{invoices.length ? "No invoices match" : bookings.length ? "No invoices yet" : "No uninvoiced active bookings"}</h3><p>{invoices.length ? "Try another invoice number, client, or event." : bookings.length ? "Select a pending or confirmed booking to create its invoice. Booking details and price are filled automatically." : "All pending/confirmed bookings already have an invoice, or there are no active bookings yet."}</p>{bookings.length > 0 && <button className="secondary-button" type="button" onClick={() => setFormOpen(true)}><Plus aria-hidden="true" /> Create from booking</button>}</div> : <div className="invoice-list">{visible.map((invoice) => <button key={invoice.id} type="button" className={`invoice-row ${selectedId === invoice.id ? "selected" : ""}`} onClick={() => setSelectedId(invoice.id)}><span><strong>{invoice.invoice_number}</strong><small>{invoice.client_name}</small></span><span><strong>{peso(Number(invoice.total_amount))}</strong><small>{invoice.event_name || "Linked booking"}</small></span><span className={`invoice-status ${statusOf(invoice).toLowerCase()}`}>{statusOf(invoice)}</span><span className="invoice-row-date">{dateLabel(invoice.issue_date)}</span></button>)}</div>}</div>
      {selected ? <InvoicePreview invoice={selected} logoDataUrl={logoDataUrl} emailReady={emailReady} working={workingId === selected.id} onSend={() => void send(selected)} onVoid={() => void voidInvoice(selected)} /> : <aside className="invoice-preview panel invoice-preview-empty"><span className="invoice-paper-icon"><Receipt aria-hidden="true" /></span><h2>Select an invoice</h2><p>Choose a row to review, send by email, or print.</p></aside>}
    </section>
    {formOpen && <InvoiceForm bookings={bookings} onClose={() => setFormOpen(false)} onSave={async (payload) => { const response = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice could not be generated."); setFormOpen(false); await reload(); setSelectedId(result.invoice.id); await showNotice(`${result.invoice.invoice_number} was generated from the booking.`, "Invoice created"); }} />}
  </>;
}

function InvoicePreview({ invoice, logoDataUrl, emailReady, working, onSend, onVoid }: { invoice: Invoice; logoDataUrl: string | null; emailReady: boolean; working: boolean; onSend: () => void; onVoid: () => void }) {
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const paid = invoice.booking_id ? Math.min(Number(invoice.total_amount), Number(invoice.booking_paid || 0)) : 0;
  const due = Math.max(0, Number(invoice.total_amount) - paid);
  const label = invoice.status === "SENT" && due === 0 ? "PAID" : invoice.status === "SENT" && invoice.due_date && invoice.due_date < today() ? "OVERDUE" : invoice.status;
  const event = { ...(invoice.booking_details || {}), eventName: invoice.booking_details?.eventName || invoice.event_name, packageName: invoice.booking_details?.packageName || invoice.package_name, eventDate: invoice.booking_details?.eventDate || invoice.event_date, startTime: invoice.booking_details?.startTime || invoice.start_time, endTime: invoice.booking_details?.endTime || invoice.end_time, venue: invoice.booking_details?.venue || invoice.venue };
  return <aside className="invoice-preview panel"><div className="invoice-preview-toolbar"><span className={`invoice-status ${label.toLowerCase()}`}>{label}</span><div className="invoice-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Print / PDF</button>{invoice.status !== "VOID" && invoice.status !== "PAID" && <button className="primary-button" type="button" onClick={onSend} disabled={working || !emailReady || !invoice.client_email}>{working ? "Sending…" : <><Send aria-hidden="true" /> Send invoice</>}</button>}</div></div>
    <article className="invoice-paper" id="printable-invoice"><header className="invoice-paper-head"><div className="invoice-brand-lockup">{logoDataUrl ? <img className="invoice-paper-logo" src={logoDataUrl} alt="Salikha Studio logo" /> : <span className="invoice-brand-mark">S</span>}<div><strong>Salikha Studio</strong><small>Event Photo Services</small></div></div><div className="invoice-heading"><span>INVOICE</span><strong>{invoice.invoice_number}</strong></div></header>
      <div className="invoice-meta"><div className="invoice-bill-to"><small>Bill to</small><strong>{invoice.client_name}</strong><span>{invoice.client_email || "No client email"}</span></div><div className="invoice-meta-dates"><div><small>Invoice date</small><strong>{dateLabel(invoice.issue_date)}</strong></div><div className="invoice-due-date"><small>Due date</small><strong>{dateLabel(invoice.due_date)}</strong></div></div></div>
      <div className="invoice-event-link"><span>Event</span><strong>{event.eventName || invoice.event_name || "Event booking"}</strong><span>{event.packageName || "Package"}</span><span>{dateLabel(event.eventDate || invoice.event_date)}</span><span>{timeLabel(event.startTime)} – {timeLabel(event.endTime)}</span><span>{event.venue || "Venue not specified"}</span></div>
      <table className="invoice-items-table"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.description}-${index}`}><td>{line.description}</td><td>{Number(line.quantity).toLocaleString("en-PH")}</td><td>{peso(Number(line.unitPrice))}</td><td>{peso(Number(line.quantity) * Number(line.unitPrice))}</td></tr>)}</tbody></table>
      <div className="invoice-totals"><div><span>Booking total</span><strong>{peso(Number(invoice.total_amount))}</strong></div>{paid > 0 && <div><span>Paid to date</span><strong>−{peso(paid)}</strong></div>}<div className="invoice-balance"><span>Balance due</span><strong>{peso(due)}</strong></div></div>
      {invoice.terms && <div className="invoice-footnotes"><div><strong>Payment terms</strong><p>{invoice.terms}</p></div></div>}
      <footer className="invoice-thanks"><ShieldCheck aria-hidden="true" /><span>Thank you for choosing Salikha Studio.</span></footer>
    </article>
    <div className="invoice-record-footer"><span>{invoice.email_sent_to ? `Last sent to ${invoice.email_sent_to}` : invoice.client_email ? `Ready to send to ${invoice.client_email}` : "Add a client email to enable sending"}</span>{invoice.status !== "VOID" && invoice.status !== "PAID" && <button className="text-button danger-button" type="button" onClick={onVoid}>Void invoice <ArrowRight aria-hidden="true" /></button>}</div>
  </aside>;
}

function InvoiceForm({ bookings, onClose, onSave }: { bookings: Booking[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [bookingId, setBookingId] = useState("");
  const [dueDate, setDueDate] = useState(addDays(today(), 7));
  const [terms, setTerms] = useState("Payment is due by the date shown above. Please contact Salikha Studio for payment details.");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const booking = bookings.find((item) => item.id === bookingId) || null;
  const choose = (id: string) => { setBookingId(id); const selected = bookings.find((item) => item.id === id); if (selected?.event_date) setDueDate(selected.event_date.slice(0, 10)); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); if (!bookingId) { setError("Choose an active booking first."); return; } setSaving(true); try { await onSave({ bookingId, dueDate, terms }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Invoice could not be generated."); } finally { setSaving(false); } };
  return <div className="invoice-form-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="invoice-form-drawer" onSubmit={(event) => void submit(event)}><header className="invoice-form-header"><div><p className="eyebrow">Booking-based invoice</p><h2 id="invoice-form-title">Create invoice</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close invoice form"><X aria-hidden="true" /></button></header>
    <div className="invoice-form-body"><p className="invoice-auto-note">Choose an active booking. Client, package, event schedule, venue, and price will come directly from its saved record.</p><div className="invoice-form-fields"><label className="invoice-booking-select">Active booking<select value={bookingId} onChange={(event) => choose(event.target.value)} required><option value="">Select booking</option>{bookings.map((item) => <option key={item.id} value={item.id}>{item.event_name} · {dateLabel(item.event_date)} · {item.client_name}</option>)}</select></label><label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label></div>
      {booking && <section className="invoice-booking-summary"><p className="eyebrow">Invoice details from booking</p><h3>{booking.event_name}</h3><dl><div><dt>Client</dt><dd>{booking.client_name}</dd></div><div><dt>Email</dt><dd>{booking.client_email || "Not on client record"}</dd></div><div><dt>Package</dt><dd>{booking.package_name || "Event photo service"}</dd></div><div><dt>Date & time</dt><dd>{dateLabel(booking.event_date)} · {timeLabel(booking.start_time)} – {timeLabel(booking.end_time)}</dd></div><div><dt>Venue</dt><dd>{booking.venue || "Not specified"}</dd></div><div><dt>Booking total</dt><dd>{peso(Number(booking.total_amount))}</dd></div>{Number(booking.paid_amount) > 0 && <div><dt>Already paid</dt><dd>−{peso(Number(booking.paid_amount))}</dd></div>}<div className="invoice-summary-balance"><dt>Balance due</dt><dd>{peso(Math.max(0, Number(booking.total_amount) - Number(booking.paid_amount || 0)))}</dd></div></dl></section>}
      <label className="invoice-long-field">Payment terms<textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={3} maxLength={1200} /></label>{error && <p className="form-warning" role="alert">{error}</p>}
    </div><footer className="invoice-form-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving || !bookings.length}>{saving ? "Generating…" : "Generate invoice"}<ArrowRight aria-hidden="true" /></button></footer>
  </form></div>;
}
