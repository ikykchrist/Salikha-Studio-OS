"use client";

import { Children, isValidElement, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CircleCheck, Info, X } from "lucide-react";
import { ToastHost } from './toasts';

type DialogRequest = { id: number; kind: "alert" | "confirm"; title: string; message: ReactNode; confirmLabel: string; cancelLabel: string; danger: boolean };
type QueuedDialog = DialogRequest & { resolve: (confirmed: boolean) => void };
let current: DialogRequest | null = null;
let active: QueuedDialog | null = null;
const queue: QueuedDialog[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function publish() { for (const listener of listeners) listener(); }
function startNext() {
  active = queue.shift() ?? null;
  current = active;
  publish();
}
function enqueue(input: Omit<DialogRequest, "id">) {
  return new Promise<boolean>((resolve) => {
    queue.push({ ...input, id: nextId++, resolve });
    if (!active) startNext();
  });
}
export async function showNotice(message: string, title = "Notice") {
  await enqueue({ kind: "alert", title, message, confirmLabel: "Got it", cancelLabel: "", danger: false });
}
export function showWarning(message: string) {
  return enqueue({ kind: "alert", title: "Please check", message, confirmLabel: "Got it", cancelLabel: "", danger: true });
}

function warningText(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child) ? warningText(child.props.children) : String(child)).join(" ");
}

export function WarningNotice({ children }: { children: ReactNode }) {
  const content = useRef(children);
  content.current = children;
  const message = warningText(children);
  useEffect(() => {
    const id = nextId++;
    queue.push({ id, kind: "alert", title: "Please check", message: content.current, confirmLabel: "Got it", cancelLabel: "", danger: true, resolve: () => undefined });
    if (!active) startNext();
    return () => {
      const index = queue.findIndex(item => item.id === id);
      if (index >= 0) queue.splice(index, 1);
      if (active?.id === id) settle(false);
    };
  }, [message]);
  return <button type="button" className="text-button warning-reminder" onClick={() => void enqueue({ kind: "alert", title: "Please check", message: children, confirmLabel: "Got it", cancelLabel: "", danger: true })}>View warning</button>;
}
export function showConfirm(message: string, options: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}) {
  return enqueue({ kind: "confirm", title: options.title || "Please confirm", message, confirmLabel: options.confirmLabel || "Continue", cancelLabel: options.cancelLabel || "Cancel", danger: options.danger ?? false });
}
function settle(confirmed: boolean) {
  if (!active) return;
  const finished = active;
  active = null;
  current = null;
  finished.resolve(confirmed);
  startNext();
}
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function getSnapshot() { return current; }

export function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message?: string) => { void showWarning(String(message ?? "")); };
    let invalidPending = false;
    const onInvalid = (event: Event) => {
      event.preventDefault();
      const field = event.target;
      if (invalidPending || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      invalidPending = true;
      const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute("aria-label") || "This field";
      void showWarning(`${label}\n${field.validationMessage}`).then(() => { invalidPending = false; if (field.isConnected) field.focus(); });
    };
    document.addEventListener("invalid", onInvalid, true);
    const onToast = (event: Event) => {
      const toast = (event as CustomEvent<{ tone: string; message: string }>).detail;
      if (toast.tone === "warning") void showWarning(toast.message);
    };
    window.addEventListener("salikha-toast", onToast);
    return () => { window.alert = nativeAlert; document.removeEventListener("invalid", onInvalid, true); window.removeEventListener("salikha-toast", onToast); };
  }, []);
  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); settle(false); }
      if (event.key === "Tab") {
        const buttons = Array.from(sectionRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKeyDown, true); document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [dialog?.id]);
  if (!dialog) return <ToastHost/>;
  const Icon = dialog.danger ? AlertTriangle : dialog.kind === "confirm" ? Info : CircleCheck;
  return <><ToastHost/>{createPortal(<div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) settle(false); }}>
    <section ref={sectionRef} className={`app-dialog ${dialog.danger ? "danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
      <div className={`app-dialog-icon ${dialog.danger ? "danger" : ""}`}><Icon aria-hidden="true" /></div>
      <button className="app-dialog-close" type="button" aria-label="Close dialog" onClick={() => settle(false)}><X aria-hidden="true" /></button>
      <h2 id="app-dialog-title">{dialog.title}</h2>
      <div id="app-dialog-message">{dialog.message}</div>
      <div className="app-dialog-actions">
        {dialog.kind === "confirm" && <button className="secondary-button" type="button" onClick={() => settle(false)}>{dialog.cancelLabel}</button>}
        <button className={dialog.danger ? "app-dialog-danger-button" : "primary-button"} type="button" ref={confirmRef} onClick={() => settle(true)}>{dialog.confirmLabel}</button>
      </div>
    </section>
  </div>, document.body)}</>;
}
