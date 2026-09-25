"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FilePlus2, Mail, Pencil, Plus, Printer, Receipt, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { showConfirm, showNotice } from "../lib/ui-dialogs";

type InvoiceLine = { description: string; quantity: number; unitPrice: number };
type ClientOption = { id: string; display_name: string; email: string | null };
type BookingOption = { id: string; client_id: string; event_name: string; event_date: string; total_amount: number; downpayment_amount: number; paid_amount: number; package_name: string | null };
type Invoice = { id: string; invoice_number: string; client_id: string; booking_id: string | null; issue_date: string; due_date: string | null; status: "DRAFT" | "SENT" | "PAID" | "VOID"; line_items: InvoiceLine[]; subtotal: number; discount_amount: number; tax_rate: number; tax_amount: number; total_amount: number; notes: string | null; terms: string | null; email_sent_to: string | null; sent_at: string | null; client_name: string; client_email: string | null; event_name: string | null; event_date: string | null; booking_paid: number | null };
const peso = (value: number) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date); };
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "—";

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [emailReady, setEmailReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [search, setSearch] = useState("");

  const reload = async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/invoices", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invoices could not be loaded.");
      setInvoices(result.invoices as Invoice[]);
      setClients(result.clients as ClientOption[]);
      setBookings(result.bookings as BookingOption[]);
      setEmailReady(Boolean(result.emailReady));
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Invoices could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);

  const visible = useMemo(() => invoices.filter((invoice) => `${invoice.invoice_number} ${invoice.client_name} ${invoice.event_name || ""}`.toLowerCase().includes(search.toLowerCase())), [invoices, search]);
  const selected = visible.find((invoice) => invoice.id === selectedId) || invoices.find((invoice) => invoice.id === selectedId) || null;
  const outstanding = invoices.filter((invoice) => invoice.status === "SENT").reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.booking_paid || 0)), 0);
  const statusOf = (invoice: Invoice) => invoice.status === "SENT" && invoice.booking_id && Number(invoice.booking_paid || 0) >= Number(invoice.total_amount) ? "PAID" : invoice.status === "SENT" && invoice.due_date && invoice.due_date < today() ? "OVERDUE" : invoice.status;
  const startCreate = () => { setEditing(null); setFormOpen(true); };
  const editDraft = () => { if (selected?.status === "DRAFT") { setEditing(selected); setFormOpen(true); } };

  const send = async (invoice: Invoice) => {
    if (!invoice.client_email) { await showNotice("Add an email address to the client record before sending this invoice.", "Client email needed"); return; }
    if (!emailReady) { await showNotice("Invoice email is not set up yet. Add RESEND_API_KEY and INVOICE_FROM_EMAIL to the local server environment, then restart the app.", "Email setup required"); return; }
    if (!await showConfirm(`Send invoice ${invoice.invoice_number} to ${invoice.client_email}?`, { title: "Send invoice", confirmLabel: "Send invoice" })) return;
    setWorkingId(invoice.id);
    try {
      const response = await fetch("/api/invoices/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invoice.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invoice email could not be sent.");
      await showNotice(`${invoice.invoice_number} was sent to ${result.sentTo}.`, "Invoice sent");
      await reload();
    } catch (error) { await showNotice(error instanceof Error ? error.message : "Invoice email could not be sent.", "Could not send invoice"); }
    finally { setWorkingId(""); }
  };
  const voidInvoice = async (invoice: Invoice) => {
    if (!await showConfirm(`Void invoice ${invoice.invoice_number}? This keeps its audit record but marks it unusable.`, { title: "Void invoice", confirmLabel: "Void invoice", danger: true })) return;
    setWorkingId(invoice.id);
    try {
      const response = await fetch("/api/invoices", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invoice.id, status: "VOID" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invoice could not be voided.");
      await showNotice(`${invoice.invoice_number} is now void.`, "Invoice voided");
      await reload();
    } catch (error) { await showNotice(error instanceof Error ? error.message : "Invoice could not be voided.", "Could not void invoice"); }
    finally { setWorkingId(""); }
  };

  return <>
    <section className="page-heading"><div><p className="eyebrow">Finance / Receivables</p><h1>Invoices</h1><p className="subheading">Prepare polished client invoices, track what was sent, and print a clean copy.</p></div><button className="primary-button" type="button" onClick={startCreate}><Plus aria-hidden="true" /> New invoice</button></section>
    <section className="invoice-metrics"><article className="metric-card"><span>Total invoices</span><strong>{invoices.length}</strong><small>Saved in this workspace</small></article><article className="metric-card"><span>Drafts</span><strong>{invoices.filter((invoice) => invoice.status === "DRAFT").length}</strong><small>Ready for review</small></article><article className="metric-card"><span>Sent and outstanding</span><strong>{peso(outstanding)}</strong><small>Linked booking payments are reflected</small></article><article className="metric-card"><span>Overdue</span><strong>{invoices.filter((invoice) => statusOf(invoice) === "OVERDUE").length}</strong><small>Past the due date</small></article></section>
    {!emailReady && <div className="invoice-email-setup"><Mail aria-hidden="true" /><span><strong>Email sending needs setup.</strong> Configure <code>RESEND_API_KEY</code> and <code>INVOICE_FROM_EMAIL</code> on this local app server. Invoice creation and printing are ready now.</span></div>}
    {loadError && <p className="form-warning" role="alert">{loadError}</p>}
    <section className="invoice-workspace">
      <div className="invoice-register panel"><div className="panel-heading"><div><p className="eyebrow">Invoice register</p><h2>All invoices</h2></div><span className="muted-label">{visible.length} records</span></div><label className="invoice-search"><span className="sr-only">Search invoices</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, client, or event" /></label>
        {loading ? <div className="invoice-empty">Loading invoices…</div> : visible.length === 0 ? <div className="invoice-empty"><span className="empty-mark"><Receipt aria-hidden="true" /></span><h3>{invoices.length ? "No invoices match" : "No invoices yet"}</h3><p>{invoices.length ? "Try another invoice number, client, or event." : "Create a draft invoice from a client or booking, then send it directly to the client’s email."}</p><button className="secondary-button" type="button" onClick={startCreate}><FilePlus2 aria-hidden="true" /> Create invoice</button></div> : <div className="invoice-list">{visible.map((invoice) => <button key={invoice.id} type="button" className={`invoice-row ${selectedId === invoice.id ? "selected" : ""}`} onClick={() => setSelectedId(invoice.id)}><span><strong>{invoice.invoice_number}</strong><small>{invoice.client_name}</small></span><span><strong>{peso(Number(invoice.total_amount))}</strong><small>{invoice.event_name || "Custom invoice"}</small></span><span className={`invoice-status ${statusOf(invoice).toLowerCase()}`}>{statusOf(invoice)}</span><span className="invoice-row-date">{dateLabel(invoice.issue_date)}</span></button>)}</div>}
      </div>
      {selected ? <InvoicePreview invoice={selected} emailReady={emailReady} working={workingId === selected.id} onSend={() => void send(selected)} onEdit={editDraft} onVoid={() => void voidInvoice(selected)} /> : <aside className="invoice-preview panel invoice-preview-empty"><span className="invoice-paper-icon"><Receipt aria-hidden="true" /></span><h2>Select an invoice</h2><p>Choose a row to review, edit a draft, send by email, or print.</p></aside>}
    </section>
    {formOpen && <InvoiceForm key={editing?.id || "new"} initial={editing} clients={clients} bookings={bookings} onClose={() => setFormOpen(false)} onSave={async (payload) => { const response = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice could not be saved."); setFormOpen(false); await reload(); setSelectedId(result.invoice.id); await showNotice(`${result.invoice.invoice_number} was saved as a draft.`, "Draft saved"); }} />}
  </>;
}

function InvoicePreview({ invoice, emailReady, working, onSend, onEdit, onVoid }: { invoice: Invoice; emailReady: boolean; working: boolean; onSend: () => void; onEdit: () => void; onVoid: () => void }) {
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const paid = invoice.booking_id ? Math.min(Number(invoice.total_amount), Number(invoice.booking_paid || 0)) : 0;
  const due = Math.max(0, Number(invoice.total_amount) - paid);
  const label = invoice.status === "SENT" && due === 0 ? "PAID" : invoice.status === "SENT" && invoice.due_date && invoice.due_date < today() ? "OVERDUE" : invoice.status;
  return <aside className="invoice-preview panel"><div className="invoice-preview-toolbar"><span className={`invoice-status ${label.toLowerCase()}`}>{label}</span><div className="invoice-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Print / PDF</button>{invoice.status === "DRAFT" && <button className="secondary-button" type="button" onClick={onEdit}><Pencil aria-hidden="true" /> Edit draft</button>}{invoice.status !== "VOID" && invoice.status !== "PAID" && <button className="primary-button" type="button" onClick={onSend} disabled={working || !emailReady || !invoice.client_email}>{working ? "Sending…" : <><Send aria-hidden="true" /> Send invoice</>}</button>}</div></div>
    <article className="invoice-paper" id="printable-invoice"><header className="invoice-paper-head"><div><span className="invoice-brand-mark">S</span><div><strong>Salikha Studio</strong><small>Event Photo Services</small></div></div><div className="invoice-heading"><span>INVOICE</span><strong>{invoice.invoice_number}</strong></div></header>
      <div className="invoice-meta"><div><small>Bill to</small><strong>{invoice.client_name}</strong><span>{invoice.client_email || "No client email"}</span></div><div><small>Invoice date</small><strong>{dateLabel(invoice.issue_date)}</strong><small className="invoice-due-label">Due date</small><strong>{dateLabel(invoice.due_date)}</strong></div></div>
      {invoice.event_name && <div className="invoice-event-link"><span>Event</span><strong>{invoice.event_name}</strong>{invoice.event_date && <span>{dateLabel(invoice.event_date)}</span>}</div>}
      <table className="invoice-items-table"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.description}-${index}`}><td>{line.description}</td><td>{Number(line.quantity).toLocaleString("en-PH")}</td><td>{peso(Number(line.unitPrice))}</td><td>{peso(Number(line.quantity) * Number(line.unitPrice))}</td></tr>)}</tbody></table>
      <div className="invoice-totals"><div><span>Subtotal</span><strong>{peso(Number(invoice.subtotal))}</strong></div>{Number(invoice.discount_amount) > 0 && <div><span>Discount</span><strong>−{peso(Number(invoice.discount_amount))}</strong></div>}{Number(invoice.tax_rate) > 0 && <div><span>Tax · {Number(invoice.tax_rate)}%</span><strong>{peso(Number(invoice.tax_amount))}</strong></div>}<div className="invoice-grand-total"><span>Total</span><strong>{peso(Number(invoice.total_amount))}</strong></div>{invoice.booking_id && paid > 0 && <><div><span>Paid to date</span><strong>−{peso(paid)}</strong></div><div className="invoice-balance"><span>Balance due</span><strong>{peso(due)}</strong></div></>}</div>
      {(invoice.notes || invoice.terms) && <div className="invoice-footnotes">{invoice.notes && <div><strong>Notes</strong><p>{invoice.notes}</p></div>}{invoice.terms && <div><strong>Payment terms</strong><p>{invoice.terms}</p></div>}</div>}
      <footer className="invoice-thanks"><ShieldCheck aria-hidden="true" /><span>Thank you for choosing Salikha Studio.</span></footer>
    </article>
    <div className="invoice-record-footer"><span>{invoice.email_sent_to ? `Last sent to ${invoice.email_sent_to}` : invoice.client_email ? `Ready to send to ${invoice.client_email}` : "Add a client email to enable sending"}</span>{invoice.status !== "VOID" && invoice.status !== "PAID" && <button className="text-button danger-button" type="button" onClick={onVoid}>Void invoice <ArrowRight aria-hidden="true" /></button>}</div>
  </aside>;
}

function InvoiceForm({ initial, clients, bookings, onClose, onSave }: { initial: Invoice | null; clients: ClientOption[]; bookings: BookingOption[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [clientId, setClientId] = useState(initial?.client_id || "");
  const [bookingId, setBookingId] = useState(initial?.booking_id || "");
  const [issueDate, setIssueDate] = useState(initial?.issue_date?.slice(0, 10) || today());
  const [dueDate, setDueDate] = useState(initial?.due_date?.slice(0, 10) || addDays(today(), 7));
  const [lines, setLines] = useState<InvoiceLine[]>(initial?.line_items || [{ description: "", quantity: 1, unitPrice: 0 }]);
  const [discount, setDiscount] = useState(String(initial?.discount_amount || 0));
  const [tax, setTax] = useState(String(initial?.tax_rate || 0));
  const [notes, setNotes] = useState(initial?.notes || "");
  const [terms, setTerms] = useState(initial?.terms || "Payment is due by the date shown above. Please contact Salikha Studio for payment details.");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
  const discountValue = Number(discount) || 0;
  const taxValue = Number(tax) || 0;
  const taxAmount = Math.max(0, subtotal - discountValue) * taxValue / 100;
  const total = Math.max(0, subtotal - discountValue + taxAmount);
  const matchingBookings = bookings.filter((booking) => booking.client_id === clientId);
  const setLine = (index: number, field: keyof InvoiceLine, value: string) => setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: field === "description" ? value : Number(value) } : line));
  const selectBooking = (id: string) => {
    setBookingId(id);
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;
    setClientId(booking.client_id);
    setLines([{ description: `${booking.package_name || "Event photography service"} — ${booking.event_name}`, quantity: 1, unitPrice: Number(booking.total_amount) }]);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!clientId || !lines.length || lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0) || discountValue > subtotal) { setError("Choose a client and ensure each line has a description, valid quantity, and price. Discount cannot exceed subtotal."); return; }
    setSaving(true);
    try { await onSave({ ...(initial ? { id: initial.id } : {}), clientId, bookingId: bookingId || null, issueDate, dueDate: dueDate || null, lineItems: lines, discountAmount: discountValue, taxRate: taxValue, notes, terms }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invoice could not be saved."); }
    finally { setSaving(false); }
  };
  return <div className="invoice-form-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="invoice-form-drawer" onSubmit={(event) => void submit(event)}><header className="invoice-form-header"><div><p className="eyebrow">{initial ? "Edit draft" : "New document"}</p><h2 id="invoice-form-title">{initial ? `Edit ${initial.invoice_number}` : "Create invoice"}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close invoice form"><X aria-hidden="true" /></button></header>
    <div className="invoice-form-body"><div className="invoice-form-fields"><label>Client<select value={clientId} onChange={(event) => { setClientId(event.target.value); setBookingId(""); }} required><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.display_name}{client.email ? ` · ${client.email}` : " · no email"}</option>)}</select></label><label>Related booking <select value={bookingId} onChange={(event) => selectBooking(event.target.value)}><option value="">Custom invoice / no booking</option>{matchingBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.event_name} · {dateLabel(booking.event_date)}</option>)}</select></label><label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></label><label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div>
      <div className="invoice-lines-editor"><div className="invoice-editor-heading"><div><p className="eyebrow">Line items</p><h3>What you’re billing</h3></div><button className="secondary-button" type="button" onClick={() => setLines((current) => [...current, { description: "", quantity: 1, unitPrice: 0 }])}><Plus aria-hidden="true" /> Add line</button></div>{lines.map((line, index) => <div className="invoice-line-editor" key={`line-${index}`}><label>Description<input value={line.description} onChange={(event) => setLine(index, "description", event.target.value)} maxLength={180} placeholder="e.g. Photobooth package" required /></label><label>Qty<input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => setLine(index, "quantity", event.target.value)} required /></label><label>Unit price<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLine(index, "unitPrice", event.target.value)} required /></label><button className="invoice-remove-line" type="button" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" /></button></div>)}</div>
      <div className="invoice-form-fields invoice-adjustments"><label>Discount<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label><label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} /></label></div>
      <label className="invoice-long-field">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Optional note for the client" /></label><label className="invoice-long-field">Payment terms<textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={2} /></label>
      <div className="invoice-form-totals"><div><span>Subtotal</span><strong>{peso(subtotal)}</strong></div><div><span>Discount</span><strong>−{peso(discountValue)}</strong></div><div><span>Tax · {taxValue}%</span><strong>{peso(taxAmount)}</strong></div><div className="invoice-grand-total"><span>Total due</span><strong>{peso(total)}</strong></div></div>
      {error && <p className="form-warning" role="alert">{error}</p>}
    </div><footer className="invoice-form-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft"}<ArrowRight aria-hidden="true" /></button></footer>
  </form></div>;
}
