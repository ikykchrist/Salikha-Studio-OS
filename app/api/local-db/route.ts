import { getLocalPostgresPool } from "../../../lib/local-postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tables = new Set([
  "profiles", "clients", "service_packages", "bookings", "payments", "cash_accounts",
  "cash_transactions", "expenses", "inventory_items", "inventory_movements", "equipment",
  "equipment_maintenance", "package_recipes", "package_addons", "booking_consumable_usage",
  "calendar_events", "audit_logs",
]);
const relations: Record<string, Record<string, { table: string; localKey: string; foreignKey: string }>> = {
  bookings: { clients: { table: "clients", localKey: "client_id", foreignKey: "id" }, service_packages: { table: "service_packages", localKey: "package_id", foreignKey: "id" } },
  expenses: { bookings: { table: "bookings", localKey: "booking_id", foreignKey: "id" } },
  cash_transactions: { cash_accounts: { table: "cash_accounts", localKey: "account_id", foreignKey: "id" } },
};
type RequestBody = {
  table: string;
  operation: "select" | "insert" | "update" | "delete";
  columns?: string;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  filters?: { column: string; value: unknown }[];
  order?: { column: string; ascending: boolean };
  count?: "exact";
  head?: boolean;
};

const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Invalid column name.");
  return `"${name}"`;
};

async function columnsFor(table: string) {
  const { rows } = await getLocalPostgresPool().query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  return new Set<string>(rows.map((row: { column_name: string }) => row.column_name));
}

function selectedColumns(table: string, columns: string | undefined, allowed: Set<string>) {
  if (!columns || columns.trim() === "*") return `"${table}".*`;
  const items = columns.split(",").map((part) => part.trim()).filter(Boolean);
  const expressions: string[] = [];
  for (const item of items) {
    const relation = /^([a-z_][a-z0-9_]*)\(([^()]*)\)$/i.exec(item);
    if (relation) {
      const [, relationName, fieldList] = relation;
      const relationship = relations[table]?.[relationName];
      if (!relationship) throw new Error(`Unsupported relationship ${relationName} on ${table}.`);
      const relationFields = fieldList.split(",").map((field) => field.trim());
      if (!relationFields.length || relationFields.some((field) => !/^[a-z_][a-z0-9_]*$/i.test(field))) throw new Error("Invalid relationship fields.");
      const jsonFields = relationFields.map((field) => {
        identifier(field);
        return `'${field}', ${identifier("related")}.${identifier(field)}`;
      }).join(", ");
      expressions.push(`(select jsonb_build_object(${jsonFields}) from public.${identifier(relationship.table)} as ${identifier("related")} where ${identifier("related")}.${identifier(relationship.foreignKey)} = ${identifier(table)}.${identifier(relationship.localKey)} limit 1) as ${identifier(relationName)}`);
      continue;
    }
    const alias = /^([a-z_][a-z0-9_]*)\s*:\s*([a-z_][a-z0-9_]*)$/i.exec(item);
    const field = alias?.[2] ?? item;
    if (!allowed.has(field)) throw new Error(`Unknown column ${field} on ${table}.`);
    expressions.push(`${identifier(table)}.${identifier(field)}${alias ? ` as ${identifier(alias[1])}` : ""}`);
  }
  return expressions.join(", ");
}

export async function GET() {
  try {
    const { rows } = await getLocalPostgresPool().query("select current_database() as database, inet_server_addr()::text as address");
    return Response.json({ status: "ok", backend: "local-postgresql", ...rows[0] });
  } catch (error) {
    return Response.json({ status: "error", backend: "local-postgresql", error: error instanceof Error ? error.message : "Database unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const { table, operation } = body;
    if (!tables.has(table) || !["select", "insert", "update", "delete"].includes(operation)) return Response.json({ error: "Unsupported table or operation." }, { status: 400 });
    const pool = getLocalPostgresPool();
    const allowed = await columnsFor(table);
    if (allowed.size === 0) return Response.json({ error: `Local table ${table} is not initialized.` }, { status: 503 });
    const values: unknown[] = [];
    const filters = (body.filters ?? []).map(({ column, value }) => {
      if (!allowed.has(column)) throw new Error(`Unknown filter column ${column} on ${table}.`);
      values.push(value);
      return `${identifier(column)} = $${values.length}`;
    });
    const where = filters.length ? ` where ${filters.join(" and ")}` : "";
    let rows: Record<string, unknown>[] = [];
    let count: number | null = null;

    if (operation === "select") {
      const projection = selectedColumns(table, body.columns, allowed);
      if (body.count === "exact") {
        const countResult = await pool.query(`select count(*)::int as count from public.${identifier(table)}${where}`, values);
        count = countResult.rows[0].count;
      }
      if (!body.head) {
        let sql = `select ${projection} from public.${identifier(table)}${where}`;
        if (body.order) {
          if (!allowed.has(body.order.column)) throw new Error(`Unknown order column ${body.order.column} on ${table}.`);
          sql += ` order by ${identifier(body.order.column)} ${body.order.ascending ? "asc" : "desc"}`;
        }
        const result = await pool.query(sql, values);
        rows = result.rows;
        if (count === null) count = rows.length;
      }
    } else if (operation === "insert") {
      const payloads = (Array.isArray(body.payload) ? body.payload : [body.payload]) as Record<string, unknown>[];
      if (!payloads.length || payloads.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Insert payload must contain at least one object.");
      const keys = Object.keys(payloads[0]);
      if (!keys.length || payloads.some((row) => keys.length !== Object.keys(row).length || keys.some((key) => !(key in row)))) throw new Error("All inserted records must use the same fields.");
      for (const key of keys) if (!allowed.has(key)) throw new Error(`Unknown insert column ${key} on ${table}.`);
      const tupleList = payloads.map((row) => `(${keys.map((key) => { values.push(row[key]); return `$${values.length}`; }).join(", ")})`).join(", ");
      const returning = selectedColumns(table, body.columns, allowed);
      const result = await pool.query(`insert into public.${identifier(table)} (${keys.map(identifier).join(", ")}) values ${tupleList} returning ${returning}`, values);
      rows = result.rows;
      count = rows.length;
    } else if (operation === "update") {
      if (!filters.length) return Response.json({ error: "Updates require at least one filter." }, { status: 400 });
      const payload = body.payload;
      if (!payload || Array.isArray(payload) || typeof payload !== "object" || !Object.keys(payload).length) throw new Error("Update payload must be a non-empty object.");
      const assignments = Object.entries(payload).map(([key]) => {
        if (!allowed.has(key)) throw new Error(`Unknown update column ${key} on ${table}.`);
        return `${identifier(key)} = $${Object.entries(payload).findIndex(([candidate]) => candidate === key) + 1}`;
      });
      // Rebuild parameter order with update values first, followed by filters.
      const filterValues = (body.filters ?? []).map((filter) => filter.value);
      const updateValues = Object.values(payload);
      const updateWhere = (body.filters ?? []).map(({ column }, index) => `${identifier(column)} = $${updateValues.length + index + 1}`);
      const result = await pool.query(`update public.${identifier(table)} set ${assignments.join(", ")} where ${updateWhere.join(" and ")} returning ${selectedColumns(table, body.columns, allowed)}`, [...updateValues, ...filterValues]);
      rows = result.rows;
      count = rows.length;
    } else {
      if (!filters.length) return Response.json({ error: "Deletes require at least one filter." }, { status: 400 });
      const result = await pool.query(`delete from public.${identifier(table)}${where} returning *`, values);
      rows = result.rows;
      count = rows.length;
    }
    const shouldReturn = operation === "select" || body.columns !== undefined;
    return Response.json({ data: body.head ? null : shouldReturn ? rows : null, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local database request failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
