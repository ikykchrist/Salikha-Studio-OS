import { showNotice } from "./ui-dialogs";

export async function deleteRecord(table: string, id: string, storageKey?: string) {
  const endpoint = table === "inventory_items" ? "/api/inventory-delete" : table === "expenses" ? "/api/expense-delete" : "/api/record-delete";
  const body = table === "inventory_items" ? { inventoryItemId: id } : table === "expenses" ? { expenseId: id } : { table, id };
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const raw = await response.text();
    let result: { error?: string; message?: string; action?: string } = {};
    try { result = raw ? JSON.parse(raw) as typeof result : {}; } catch { result = {}; }
    if (!response.ok) throw new Error(result.error || `Record could not be removed (${response.status}).`);
    if (result.message) await showNotice(result.message, result.action === "archived" ? "Record archived" : "Record updated");
  } catch (error) {
    await showNotice(error instanceof Error ? error.message : "Record could not be removed.", "Unable to remove record");
    return false;
  }

  if (storageKey) {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const records = JSON.parse(stored) as Array<{ id: string }>;
      window.localStorage.setItem(storageKey, JSON.stringify(records.filter((record) => record.id !== id)));
    }
  }

  window.location.reload();
  return true;
}
