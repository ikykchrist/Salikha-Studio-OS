import { getLocalDatabase } from "./local-database";

export async function deleteRecord(table: string, id: string, storageKey?: string) {
  const database = getLocalDatabase();
  if (database) {
    const { error } = await database.from(table).delete().eq("id", id);
    if (error) {
      window.alert(`Unable to delete this record: ${error.message}`);
      return false;
    }
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
