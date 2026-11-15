"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FileDown, ImageDown, ImagePlus, LockKeyhole, Mail, Plus, Receipt, RefreshCw, Send, Trash2, X } from "lucide-react";
import { showConfirm, showNotice } from "../lib/ui-dialogs";
import { formatManilaDate, formatManilaTime } from "../lib/manila-datetime";
import { exportInvoicePage } from "../lib/invoice-export";

type InvoiceLine = { description: string; quantity: number; unitPrice: number };
type BrandingField = "logoDataUrl" | "paymentQrDataUrl";
const STORED_IMAGE_BYTES = 1024 * 1024;
const QR_UPLOAD_MB = 10;
type Booking = { id: string; client_id: string; event_name: string; event_date: string | null; start_time: string | null; end_time: string | null; venue: string | null; total_amount: number; downpayment_amount: number; paid_amount: number; status: string; client_name: string; client_email: string | null; package_name: string | null };
type BookingDetails = { eventName?: string | null; packageName?: string | null; eventDate?: string | null; startTime?: string | null; endTime?: string | null; venue?: string | null };
type Invoice = { id: string; invoice_number: string; client_id: string; booking_id: string | null; issue_date: string; due_date: string | null; status: "DRAFT" | "SENT" | "PAID" | "VOID"; line_items: InvoiceLine[]; booking_details: BookingDetails; subtotal: number; discount_amount: number; tax_rate: number; tax_amount: number; total_amount: number; notes: string | null; terms: string | null; email_sent_to: string | null; sent_at: string | null; client_name: string; client_email: string | null; event_name: string | null; event_date: string | null; start_time: string | null; end_time: string | null; venue: string | null; package_name: string | null; booking_paid: number | null };
const peso = (value: number) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const dateLabel = (value: string | null) => value ? formatManilaDate(value, { month: "short", day: "numeric", year: "numeric" }) : "TBA";
const timeLabel = (value: string | null | undefined) => value ? formatManilaTime(value) : "TBA";

function readPng(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The selected PNG could not be read."));
    reader.onerror = () => reject(new Error("The selected PNG could not be read."));
    reader.readAsDataURL(file);
  });
}

async function paymentQrImageType(file: File) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => header[index] === byte)) return "image/png";
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP") return "image/webp";
  throw new Error("Choose a PNG, JPG, or WebP image for QR Ph.");
}

async function compactPaymentQr(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not prepare the QR Ph image.");
  // Keep the encoded request and the invoice response within the hosting payload limit.
  for (const maxSide of [1200, 900, 640, 480]) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (png && png.size <= STORED_IMAGE_BYTES) return readPng(png);
  }
  throw new Error("The QR Ph image could not be prepared. Choose an image with a clearly visible QR code.");
}

export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [paymentQrDataUrl, setPaymentQrDataUrl] = useState<string | null>(null);
  const [emailReady, setEmailReady] = useState(false);
  const [emailSender, setEmailSender] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [search, setSearch] = useState("");
  const [brandingBusy, setBrandingBusy] = useState<BrandingField | null>(null);
  const [deleteVoidsOpen, setDeleteVoidsOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qrFileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/invoices", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invoices could not be loaded.");
      setInvoices(result.invoices as Invoice[]);
      setBookings(result.bookings as Booking[]);
      setLogoDataUrl(result.logoDataUrl ?? null);
      setPaymentQrDataUrl(result.paymentQrDataUrl ?? null);
      setEmailReady(Boolean(result.emailReady));
      setEmailSender(result.emailSender ?? null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Invoices could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("invoiceEmail");
    if (!status) return;
    url.searchParams.delete("invoiceEmail");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    void showNotice(status === "connected" ? "The studio Gmail account is connected. Invoice sending is ready." : status === "consent-denied" ? "Gmail permission was not granted. You can connect it later." : status === "state-error" ? "The Gmail connection expired. Please try connecting again." : status, status === "connected" ? "Invoice email connected" : "Gmail connection needs attention");
  }, []);

  const visible = useMemo(() => invoices.filter((invoice) => `${invoice.invoice_number} ${invoice.client_name} ${invoice.event_name || ""}`.toLowerCase().includes(search.toLowerCase())), [invoices, search]);
  const selected = visible.find((invoice) => invoice.id === selectedId) || invoices.find((invoice) => invoice.id === selectedId) || null;
  const outstanding = invoices.filter((invoice) => invoice.status === "SENT").reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.booking_paid || 0)), 0);
  const statusOf = (invoice: Invoice) => invoice.status === "SENT" && invoice.booking_id && Number(invoice.booking_paid || 0) >= Number(invoice.total_amount) ? "PAID" : invoice.status === "SENT" && invoice.due_date && invoice.due_date < today() ? "OVERDUE" : invoice.status;
  const voidCount = invoices.filter((invoice) => invoice.status === "VOID").length;
  const saveBranding = async (field: BrandingField, image: string | null) => {
    setBrandingBusy(field);
    const isQr = field === "paymentQrDataUrl";
    const name = isQr ? "Payment QR" : "Invoice logo";
    try {
      const response = await fetch("/api/invoices/branding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ [field]: image }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${name} could not be saved.`);
      (isQr ? setPaymentQrDataUrl : setLogoDataUrl)(result[field]);
      await showNotice(image && isQr ? "The QR Ph code will appear on invoices with a balance due." : `${name} ${image ? "saved" : "removed"}.`, `${name} ${image ? "saved" : "removed"}`);
    } catch (error) { await showNotice(error instanceof Error ? error.message : `${name} could not be saved.`, "Branding not saved"); }
    finally { setBrandingBusy(null); }
  };
  const uploadBranding = async (field: BrandingField, input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const isQr = field === "paymentQrDataUrl";
    const limitMb = isQr ? QR_UPLOAD_MB : 1;
    if (file.size > limitMb * STORED_IMAGE_BYTES) { await showNotice(`The image is larger than ${limitMb} MB. Choose a smaller file.`, "Image too large"); return; }
    if (!isQr && file.type !== "image/png") { await showNotice("Choose a PNG file for the invoice logo.", "Unsupported image"); return; }
    setBrandingBusy(field);
    let objectUrl: string | undefined;
    try {
      const type = isQr ? await paymentQrImageType(file) : file.type;
      const source = file.slice(0, file.size, type);
      objectUrl = URL.createObjectURL(source);
      const image = new Image();
      image.src = objectUrl;
      try { await image.decode(); }
      catch { throw new Error("This image could not be opened. Export a new copy and try again."); }
      const storedImage = type === "image/png" && file.size <= STORED_IMAGE_BYTES ? await readPng(source) : await compactPaymentQr(image);
      await saveBranding(field, storedImage);
    } catch (error) {
      await showNotice(error instanceof Error ? error.message : "The selected PNG could not be opened.", "Image upload failed");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBrandingBusy(null);
    }
  };

  const send = async (invoice: Invoice) => {
    if (!invoice.client_email) { await showNotice("Add an email address to the client record before sending this invoice.", "Client email needed"); return; }
    if (!emailReady) { await showNotice("Connect salikhaprintco@gmail.com in the Invoice tab first.", "Email setup required"); return; }
    if (!await showConfirm(`${invoice.sent_at ? "Resend" : "Send"} invoice ${invoice.invoice_number} from ${emailSender} to ${invoice.client_email}?`, { title: invoice.sent_at ? "Resend invoice" : "Send invoice", confirmLabel: invoice.sent_at ? "Resend invoice" : "Send invoice" })) return;
    setWorkingId(invoice.id);
    try { const response = await fetch("/api/invoices/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: invoice.id, resend: Boolean(invoice.sent_at) }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice email could not be sent."); await showNotice(`${invoice.invoice_number} was sent to ${result.sentTo}.`, "Invoice sent"); await reload(); }
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
  const refreshBookingDetails = async () => {
    if (!await showConfirm("Refresh linked invoice event details from the current booking records? Invoice numbers, totals, payments, due dates, and statuses will stay unchanged.", { title: "Refresh invoice details", confirmLabel: "Refresh details" })) return;
    setMaintenanceBusy(true);
    try { const response = await fetch("/api/invoices/maintenance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync-booking-details" }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice details could not be refreshed."); await reload(); await showNotice(`${result.updated} linked invoice${result.updated === 1 ? " was" : "s were"} refreshed from current booking details. Financial values were not changed.`, "Invoices refreshed"); }
    catch (error) { await showNotice(error instanceof Error ? error.message : "Invoice details could not be refreshed.", "Refresh failed"); }
    finally { setMaintenanceBusy(false); }
  };
  const deleteVoidedInvoices = async () => {
    setMaintenanceError("");
    if (!adminPassword) { setMaintenanceError("Enter your administrator password to continue."); return; }
    setMaintenanceBusy(true);
    try { const response = await fetch("/api/invoices/maintenance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete-void", adminPassword }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Void invoices could not be deleted."); setDeleteVoidsOpen(false); setAdminPassword(""); setSelectedId((id) => invoices.some((invoice) => invoice.id === id && invoice.status === "VOID") ? null : id); await reload(); await showNotice(`${result.deleted} void invoice${result.deleted === 1 ? " was" : "s were"} permanently deleted. Other invoices were untouched.`, "Void invoices deleted"); }
    catch (error) { setMaintenanceError(error instanceof Error ? error.message : "Void invoices could not be deleted."); }
    finally { setMaintenanceBusy(false); }
  };

  return <>
    <section className="page-heading"><div><p className="eyebrow">Finance / Receivables</p><h1>Invoices</h1><p className="subheading">Generate accurate invoices directly from bookings, then send or print them.</p></div><button className="primary-button" type="button" onClick={() => setFormOpen(true)} disabled={!bookings.length}><Plus aria-hidden="true" /> New invoice</button></section>
    <section className="invoice-branding panel"><div className="invoice-branding-copy"><span className="eyebrow">Invoice branding</span><strong>{logoDataUrl ? "Your saved logo is active" : "Use your studio logo on every invoice"}</strong><small>PNG · Maximum 1 MB</small></div>{logoDataUrl && <img className="invoice-branding-preview" src={logoDataUrl} alt="Saved invoice logo preview" />}{logoDataUrl && <button className="secondary-button" type="button" disabled={Boolean(brandingBusy)} onClick={() => void saveBranding("logoDataUrl", null)}><Trash2 aria-hidden="true" /> Remove logo</button>}<input ref={fileRef} type="file" aria-label="Invoice logo" accept="image/png,.png" hidden onChange={(event) => void uploadBranding("logoDataUrl", event.currentTarget)} /><button className="secondary-button" type="button" disabled={Boolean(brandingBusy)} onClick={() => fileRef.current?.click()}><ImagePlus aria-hidden="true" />{brandingBusy === "logoDataUrl" ? "Saving…" : logoDataUrl ? "Change logo" : "Upload PNG logo"}</button></section>
    <section className="invoice-branding panel" aria-label="Invoice payment QR"><div className="invoice-branding-copy"><strong>QR Ph payment</strong><small>Upload a reusable QR Ph from your bank or e-wallet. PNG, JPG, or WebP · Up to {QR_UPLOAD_MB} MB.</small></div>{paymentQrDataUrl && <img className="invoice-branding-preview" src={paymentQrDataUrl} alt="Saved QR Ph payment code" />}{paymentQrDataUrl && <button className="secondary-button" type="button" disabled={Boolean(brandingBusy)} onClick={() => void saveBranding("paymentQrDataUrl", null)}><Trash2 aria-hidden="true" /> Remove QR</button>}<input ref={qrFileRef} type="file" aria-label="QR Ph payment code" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden onChange={(event) => void uploadBranding("paymentQrDataUrl", event.currentTarget)} /><button className="secondary-button" type="button" disabled={Boolean(brandingBusy)} onClick={() => qrFileRef.current?.click()}><ImagePlus aria-hidden="true" />{brandingBusy === "paymentQrDataUrl" ? "Saving…" : paymentQrDataUrl ? "Change QR Ph" : "Upload QR Ph"}</button></section>
    <section className="invoice-maintenance panel"><div><p className="eyebrow">Invoice maintenance</p><strong>Keep invoices aligned with booking records</strong><small>Refreshing changes event details only. Financial values stay as issued.</small></div><div className="invoice-maintenance-actions"><button className="secondary-button" type="button" onClick={() => void refreshBookingDetails()} disabled={maintenanceBusy}><RefreshCw aria-hidden="true" /> Refresh invoice details</button><button className="secondary-button danger-button" type="button" onClick={() => { setAdminPassword(""); setMaintenanceError(""); setDeleteVoidsOpen(true); }} disabled={maintenanceBusy || voidCount === 0}><Trash2 aria-hidden="true" /> Delete void invoices ({voidCount})</button></div></section>
    <section className="invoice-metrics"><article className="metric-card"><span>Total invoices</span><strong>{invoices.length}</strong><small>Saved in this workspace</small></article><article className="metric-card"><span>Drafts</span><strong>{invoices.filter((invoice) => invoice.status === "DRAFT").length}</strong><small>Ready for review</small></article><article className="metric-card"><span>Sent and outstanding</span><strong>{peso(outstanding)}</strong><small>Linked booking payments reflected</small></article><article className="metric-card"><span>Overdue</span><strong>{invoices.filter((invoice) => statusOf(invoice) === "OVERDUE").length}</strong><small>Past the due date</small></article></section>
    <div className="invoice-email-setup"><Mail aria-hidden="true" /><span><strong>{emailReady ? `Sending from ${emailSender}` : "Connect the studio email to send invoices."}</strong> {emailReady ? "Invoices go directly through the connected Gmail account." : "Use salikhaprintco@gmail.com and approve Gmail send-only access."}</span>{!emailReady && <a className="secondary-button" href="/api/invoices/email/connect">Connect Gmail</a>}</div>
    {loadError && <p className="form-warning" role="alert">{loadError}</p>}
    <section className="invoice-workspace"><div className="invoice-register panel"><div className="panel-heading"><div><p className="eyebrow">Invoice register</p><h2>All invoices</h2></div><span className="muted-label">{visible.length} records</span></div><label className="invoice-search"><span className="sr-only">Search invoices</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, client, or event" /></label>
      {loading ? <div className="invoice-empty">Loading invoices…</div> : visible.length === 0 ? <div className="invoice-empty"><span className="empty-mark"><Receipt aria-hidden="true" /></span><h3>{invoices.length ? "No invoices match" : bookings.length ? "No invoices yet" : "No uninvoiced active bookings"}</h3><p>{invoices.length ? "Try another invoice number, client, or event." : bookings.length ? "Select a pending or confirmed booking to create its invoice. Booking details and price are filled automatically." : "All pending/confirmed bookings already have an invoice, or there are no active bookings yet."}</p>{bookings.length > 0 && <button className="secondary-button" type="button" onClick={() => setFormOpen(true)}><Plus aria-hidden="true" /> Create from booking</button>}</div> : <div className="invoice-list">{visible.map((invoice) => <button key={invoice.id} type="button" className={`invoice-row ${selectedId === invoice.id ? "selected" : ""}`} onClick={() => setSelectedId(invoice.id)}><span><strong>{invoice.invoice_number}</strong><small>{invoice.client_name}</small></span><span><strong>{peso(Number(invoice.total_amount))}</strong><small>{invoice.event_name || "Linked booking"}</small></span><span className={`invoice-status ${statusOf(invoice).toLowerCase()}`}>{statusOf(invoice)}</span><span className="invoice-row-date">{dateLabel(invoice.issue_date)}</span></button>)}</div>}</div>
      {selected ? <InvoicePreview invoice={selected} logoDataUrl={logoDataUrl} paymentQrDataUrl={paymentQrDataUrl} emailReady={emailReady} working={workingId === selected.id} onSend={() => void send(selected)} onVoid={() => void voidInvoice(selected)} /> : <aside className="invoice-preview panel invoice-preview-empty"><span className="invoice-paper-icon"><Receipt aria-hidden="true" /></span><h2>Select an invoice</h2><p>Choose a row to review, send by email, or print.</p></aside>}
    </section>
    {formOpen && <InvoiceForm bookings={bookings} onClose={() => setFormOpen(false)} onSave={async (payload) => { const response = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Invoice could not be generated."); setFormOpen(false); await reload(); setSelectedId(result.invoice.id); await showNotice(`${result.invoice.invoice_number} was generated from the booking.`, "Invoice created"); }} />}
    {deleteVoidsOpen && <div className="invoice-maintenance-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !maintenanceBusy) setDeleteVoidsOpen(false); }}><section className="invoice-maintenance-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-void-invoices-title"><div className="admin-override-icon"><LockKeyhole aria-hidden="true" /></div><p className="eyebrow">Administrator authorization</p><h2 id="delete-void-invoices-title">Delete {voidCount} void invoice{voidCount === 1 ? "" : "s"}?</h2><p>This permanently removes only invoices marked VOID. Active, sent, and paid invoices will remain unchanged.</p><label>Admin password<input autoFocus type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => { setAdminPassword(event.target.value); setMaintenanceError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void deleteVoidedInvoices(); } }} aria-invalid={Boolean(maintenanceError)} /></label>{maintenanceError && <p className="form-warning" role="alert">{maintenanceError}</p>}<div className="admin-override-actions"><button className="secondary-button" type="button" onClick={() => setDeleteVoidsOpen(false)} disabled={maintenanceBusy}>Cancel</button><button className="app-dialog-danger-button" type="button" onClick={() => void deleteVoidedInvoices()} disabled={maintenanceBusy || !adminPassword}>{maintenanceBusy ? "Verifying…" : "Verify & delete void invoices"}</button></div></section></div>}
  </>;
}

function InvoicePreview({ invoice, logoDataUrl, paymentQrDataUrl, emailReady, working, onSend, onVoid }: { invoice: Invoice; logoDataUrl: string | null; paymentQrDataUrl: string | null; emailReady: boolean; working: boolean; onSend: () => void; onVoid: () => void }) {
  const paperRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "jpg" | null>(null);
  const download = async (format: "pdf" | "jpg") => {
    if (!paperRef.current || exporting) return;
    setExporting(format);
    try { await exportInvoicePage(paperRef.current, invoice.invoice_number, format); }
    catch (cause) { await showNotice(cause instanceof Error ? cause.message : "Could not save the invoice.", "Invoice download failed"); }
    finally { setExporting(null); }
  };
  const lines = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const paid = invoice.booking_id ? Math.min(Number(invoice.total_amount), Number(invoice.booking_paid || 0)) : 0;
  const due = Math.max(0, Number(invoice.total_amount) - paid);
  const paymentQr = due > 0 && invoice.status !== "VOID" && invoice.status !== "PAID" ? paymentQrDataUrl : null;
  const label = invoice.status === "SENT" && due === 0 ? "PAID" : invoice.status === "SENT" && invoice.due_date && invoice.due_date < today() ? "OVERDUE" : invoice.status;
  const event = { eventName: invoice.event_name || invoice.booking_details?.eventName, packageName: invoice.package_name || invoice.booking_details?.packageName, eventDate: invoice.event_date || invoice.booking_details?.eventDate || null, startTime: invoice.start_time || invoice.booking_details?.startTime, endTime: invoice.end_time || invoice.booking_details?.endTime, venue: invoice.venue || invoice.booking_details?.venue };
  const eventTime = event.startTime && event.endTime ? `${timeLabel(event.startTime)} – ${timeLabel(event.endTime)}` : "TBA";
  const discount = Number(invoice.discount_amount) || 0;
  const tax = Number(invoice.tax_amount) || 0;
  return <aside className="invoice-preview panel"><div className="invoice-preview-toolbar"><span className={`invoice-status ${label.toLowerCase()}`}>{label}</span><div className="invoice-actions"><button className="secondary-button" type="button" onClick={() => void download("pdf")} disabled={Boolean(exporting)}><FileDown aria-hidden="true" /> {exporting === "pdf" ? "Saving PDF…" : "Save PDF"}</button><button className="secondary-button" type="button" onClick={() => void download("jpg")} disabled={Boolean(exporting)}><ImageDown aria-hidden="true" /> {exporting === "jpg" ? "Saving JPG…" : "Save JPG"}</button>{invoice.status !== "VOID" && invoice.status !== "PAID" && <button className="primary-button" type="button" onClick={onSend} disabled={working || !emailReady || !invoice.client_email}>{working ? "Sending…" : <><Send aria-hidden="true" /> Send invoice</>}</button>}</div></div>
    <article className="invoice-paper" id="printable-invoice" aria-labelledby="invoice-document-title" ref={paperRef}>
      <header className="invoice-paper-head">
        <div className="invoice-brand-lockup">
          {logoDataUrl ? <img className="invoice-paper-logo" src={logoDataUrl} alt="" /> : <span className="invoice-brand-mark" aria-hidden="true">S</span>}
          <div><strong>Salikha Studio</strong><small>Event Photo Services</small></div>
        </div>
        <div className="invoice-heading">
          <h2 id="invoice-document-title">Invoice</h2>
          <span>{invoice.invoice_number}</span>
          {invoice.status === "VOID" && <strong className="invoice-void-mark">Void</strong>}
        </div>
      </header>
      <div className="invoice-meta">
        <div className="invoice-bill-to"><small>Bill to</small><strong>{invoice.client_name}</strong>{invoice.client_email && <span>{invoice.client_email}</span>}</div>
        <dl className="invoice-meta-dates">
          <div><dt>Issued</dt><dd>{dateLabel(invoice.issue_date)}</dd></div>
          <div><dt>Due date</dt><dd>{dateLabel(invoice.due_date)}</dd></div>
        </dl>
      </div>
      <section className="invoice-event-link" aria-label="Event details">
        <small>Event</small>
        <strong>{event.eventName || "Event booking"}</strong>
        <dl>
          <div><dt>Service</dt><dd>{event.packageName || "Event photo service"}</dd></div>
          <div><dt>Schedule</dt><dd>{dateLabel(event.eventDate)}{eventTime !== "TBA" && <> · {eventTime}</>}</dd></div>
          <div className="invoice-event-venue"><dt>Venue</dt><dd>{event.venue || "TBA"}</dd></div>
        </dl>
      </section>
      <table className="invoice-items-table" aria-label="Invoice items" data-invoice-break>
        <thead><tr><th scope="col">Description</th><th scope="col">Qty</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={`${line.description}-${index}`} data-invoice-break={index > 0 ? "" : undefined}><td>{line.description}</td><td>{Number(line.quantity).toLocaleString("en-PH")}</td><td>{peso(Number(line.unitPrice))}</td><td>{peso(Number(line.quantity) * Number(line.unitPrice))}</td></tr>)}</tbody>
      </table>
      <section className="invoice-payment-summary" aria-label="Payment summary" data-invoice-break>
        <dl className="invoice-totals">
          {(discount > 0 || tax > 0) && <div><dt>Subtotal</dt><dd>{peso(Number(invoice.subtotal))}</dd></div>}
          {discount > 0 && <div><dt>Discount</dt><dd>−{peso(discount)}</dd></div>}
          {tax > 0 && <div><dt>Tax</dt><dd>{peso(tax)}</dd></div>}
          <div><dt>Invoice total</dt><dd>{peso(Number(invoice.total_amount))}</dd></div>
          {paid > 0 && <div><dt>Paid to date</dt><dd>−{peso(paid)}</dd></div>}
          <div className={`invoice-balance${invoice.status === "VOID" ? " invoice-balance-void" : ""}`}><dt>{invoice.status === "VOID" ? "Voided balance" : "Balance due"}</dt><dd>{peso(due)}</dd></div>
        </dl>
        {(invoice.terms || paymentQr) && <div className="invoice-footnotes">
          <strong>Payment terms</strong>
          {invoice.terms && <p>{invoice.terms}</p>}
          {paymentQr && <figure className="invoice-payment-qr"><img src={paymentQr} alt="Scan to pay via QR Ph" /><figcaption>Scan to pay via QR Ph. Enter the balance due and check the recipient before paying.</figcaption></figure>}
        </div>}
      </section>
      <footer className="invoice-thanks" data-invoice-break>Thank you for choosing Salikha Studio.</footer>
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
  const choose = (id: string) => { setBookingId(id); const selected = bookings.find((item) => item.id === id); setDueDate(selected?.event_date ? selected.event_date.slice(0, 10) : addDays(today(), 7)); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); if (!bookingId) { setError("Choose an active booking first."); return; } setSaving(true); try { await onSave({ bookingId, dueDate, terms }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Invoice could not be generated."); } finally { setSaving(false); } };
  return <div className="invoice-form-backdrop" role="dialog" aria-modal="true" aria-labelledby="invoice-form-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="invoice-form-drawer" onSubmit={(event) => void submit(event)}><header className="invoice-form-header"><div><p className="eyebrow">Booking-based invoice</p><h2 id="invoice-form-title">Create invoice</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close invoice form"><X aria-hidden="true" /></button></header>
    <div className="invoice-form-body"><p className="invoice-auto-note">Choose an active booking. Client, package, event schedule, venue, and price will come directly from its saved record.</p><div className="invoice-form-fields"><label className="invoice-booking-select">Active booking<select value={bookingId} onChange={(event) => choose(event.target.value)} required><option value="">Select booking</option>{bookings.map((item) => <option key={item.id} value={item.id}>{item.event_name} · {dateLabel(item.event_date)} · {item.client_name}</option>)}</select></label><label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label></div>
      {booking && <section className="invoice-booking-summary"><p className="eyebrow">Invoice details from booking</p><h3>{booking.event_name}</h3><dl><div><dt>Client</dt><dd>{booking.client_name}</dd></div><div><dt>Email</dt><dd>{booking.client_email || "Not on client record"}</dd></div><div><dt>Package</dt><dd>{booking.package_name || "Event photo service"}</dd></div><div><dt>Date & time</dt><dd>{dateLabel(booking.event_date)} · {timeLabel(booking.start_time)} – {timeLabel(booking.end_time)}</dd></div><div><dt>Venue</dt><dd>{booking.venue || "Not specified"}</dd></div><div><dt>Booking total</dt><dd>{peso(Number(booking.total_amount))}</dd></div>{Number(booking.paid_amount) > 0 && <div><dt>Already paid</dt><dd>−{peso(Number(booking.paid_amount))}</dd></div>}<div className="invoice-summary-balance"><dt>Balance due</dt><dd>{peso(Math.max(0, Number(booking.total_amount) - Number(booking.paid_amount || 0)))}</dd></div></dl></section>}
      <label className="invoice-long-field">Payment terms<textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={3} maxLength={1200} /></label>{error && <p className="form-warning" role="alert">{error}</p>}
    </div><footer className="invoice-form-footer"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={saving || !bookings.length}>{saving ? "Generating…" : "Generate invoice"}<ArrowRight aria-hidden="true" /></button></footer>
  </form></div>;
}
