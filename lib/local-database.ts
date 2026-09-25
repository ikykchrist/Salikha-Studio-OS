/**
 * Client-side query helper for the local PostgreSQL API. It has no cloud SDK
 * dependency and sends requests only to this Next.js application's own origin.
 */
type Filter = { column: string; value: unknown };
type QueryRequest = {
  table: string;
  operation: "select" | "insert" | "update" | "delete";
  columns?: string;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  filters: Filter[];
  order?: { column: string; ascending: boolean };
  count?: "exact";
  head?: boolean;
};
type QueryResult = { data: any; error: { message: string } | null; count: number | null };

class LocalQuery implements PromiseLike<QueryResult> {
  private request: QueryRequest;
  private returning = false;
  private singleResult: "single" | "maybeSingle" | null = null;

  constructor(table: string) {
    this.request = { table, operation: "select", filters: [] };
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.request.columns = columns;
    this.request.count = options?.count;
    this.request.head = options?.head;
    if (this.request.operation !== "select") this.returning = true;
    return this;
  }
  insert(payload: QueryRequest["payload"]) { this.request.operation = "insert"; this.request.payload = payload; return this; }
  update(payload: Record<string, unknown>) { this.request.operation = "update"; this.request.payload = payload; return this; }
  delete() { this.request.operation = "delete"; return this; }
  eq(column: string, value: unknown) { this.request.filters.push({ column, value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.request.order = { column, ascending: options?.ascending ?? true }; return this; }
  single() { this.singleResult = "single"; return this; }
  maybeSingle() { this.singleResult = "maybeSingle"; return this; }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult> {
    try {
      const response = await fetch("/api/local-db", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.request),
      });
      const raw = await response.text();
      let result: Record<string, any> = {};
      try {
        result = raw ? JSON.parse(raw) as Record<string, any> : {};
      } catch {
        return { data: null, count: null, error: { message: `Database request failed (${response.status}): ${raw.slice(0, 180) || "empty response"}` } };
      }
      if (!response.ok) return { data: null, count: null, error: { message: result.error ?? `Local database request failed (${response.status})` } };
      const rows = Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data];
      if (this.singleResult === "single") {
        if (rows.length !== 1) return { data: null, count: result.count ?? null, error: { message: `Expected one row, received ${rows.length}` } };
        return { data: rows[0], count: result.count ?? null, error: null };
      }
      if (this.singleResult === "maybeSingle") {
        if (rows.length > 1) return { data: null, count: result.count ?? null, error: { message: `Expected at most one row, received ${rows.length}` } };
        return { data: rows[0] ?? null, count: result.count ?? null, error: null };
      }
      return { data: result.data ?? null, count: result.count ?? null, error: null };
    } catch (error) {
      return { data: null, count: null, error: { message: error instanceof Error ? error.message : "Local database is unavailable" } };
    }
  }
}

export function getLocalDatabase() {
  return { from: (table: string) => new LocalQuery(table) };
}
