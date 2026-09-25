"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, CircleCheck, Info, X } from "lucide-react";

type DialogRequest = { id: number; kind: "alert" | "confirm"; title: string; message: string; confirmLabel: string; cancelLabel: string; danger: boolean };
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
  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message?: string) => { void showNotice(String(message ?? ""), "Salikha Studio OS"); };
    return () => { window.alert = nativeAlert; };
  }, []);
  useEffect(() => {
    if (!dialog) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); settle(false); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dialog?.id]);
  if (!dialog) return null;
  const Icon = dialog.danger ? AlertTriangle : dialog.kind === "confirm" ? Info : CircleCheck;
  return <div className="app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) settle(false); }}>
    <section className={`app-dialog ${dialog.danger ? "danger" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
      <div className={`app-dialog-icon ${dialog.danger ? "danger" : ""}`}><Icon aria-hidden="true" /></div>
      <button className="app-dialog-close" type="button" aria-label="Close dialog" onClick={() => settle(false)}><X aria-hidden="true" /></button>
      <h2 id="app-dialog-title">{dialog.title}</h2>
      <p id="app-dialog-message">{dialog.message}</p>
      <div className="app-dialog-actions">
        {dialog.kind === "confirm" && <button className="secondary-button" type="button" onClick={() => settle(false)}>{dialog.cancelLabel}</button>}
        <button className={dialog.danger ? "app-dialog-danger-button" : "primary-button"} type="button" ref={confirmRef} onClick={() => settle(true)}>{dialog.confirmLabel}</button>
      </div>
    </section>
  </div>;
}
