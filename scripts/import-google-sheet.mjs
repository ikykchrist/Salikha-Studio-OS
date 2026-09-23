import pg from "pg";

const { Pool } = pg;

const SHEET_ID = "1t3ogHNdZJjHdLLHiDQLdaNrVXMb4AYxmtS3rOAYZ0co";
const SHEET_GID = "1442667186";
const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
const apply = process.argv.includes("--apply");

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

function money(value) {
  const normalized = String(value ?? "").replace(/[₱,\s]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function isoDate(value) {
  const match = String(value).match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (match) {
    const date = new Date(`${match[1]} ${match[2]}, ${match[3]} 00:00:00 UTC`);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const short = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (short) return `20${short[3]}-${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}`;
  return null;
}

function normalize(rows) {
  const headers = rows[0].map((header) => header.toLowerCase());
  const column = (name) => headers.indexOf(name);
  const get = (row, name) => {
    const aliases = {
      date: ["date", "client records date"],
    };
    const index = column(name) >= 0 ? column(name) : (aliases[name] ?? []).map(column).find((candidate) => candidate >= 0);
    return index === undefined || index < 0 ? "" : row[index] ?? "";
  };
  const bookings = [];
  const warnings = [];

  for (const [index, row] of rows.slice(1).entries()) {
    const sourceRow = index + 2;
    const name = get(row, "name");
    const eventDate = isoDate(get(row, "date"));
    const total = money(get(row, "total"));
    const downPayment = money(get(row, "down payment"));
    const packageDescription = get(row, "package desc");
    const venueValue = get(row, "venue");
    if (!name && !packageDescription && !venueValue) continue;
    if (!name || !eventDate) warnings.push(`Row ${sourceRow}: missing client name or valid date`);
    if (!total && name) warnings.push(`Row ${sourceRow}: missing total amount`);

    const mapsUrl = /^https?:\/\//i.test(venueValue) ? venueValue : null;
    bookings.push({
      source_row: sourceRow,
      client: { display_name: name || "Needs review", maps_url: mapsUrl, address: mapsUrl ? null : venueValue || null },
      booking: {
        event_name: packageDescription || "Needs review",
        event_date: eventDate,
        venue: mapsUrl ? null : venueValue || null,
        total_amount: total,
        paid_amount: downPayment,
        status: "PENDING",
        notes: `Imported from CLIENT RECORDS row ${sourceRow}. Original time: ${get(row, "time") || "Not provided"}`,
      },
      payment: downPayment > 0 ? { amount: downPayment, payment_date: eventDate, method: "LEGACY_IMPORT" } : null,
    });
  }
  return { bookings, warnings };
}

async function run() {
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error(`Google Sheet export failed: HTTP ${response.status}`);
  const { bookings, warnings } = normalize(parseCsv(await response.text()));
  console.log(`Prepared ${bookings.length} booking records.`);
  console.log(`Warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`- ${warning}`);
  if (!apply) {
    console.log("Dry run only. No database writes were made.");
    console.log("Review the warnings, start local PostgreSQL, then run: node scripts/import-google-sheet.mjs --apply");
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("--apply requires DATABASE_URL for local PostgreSQL");
  const databaseUrl = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("Google Sheet imports are restricted to localhost PostgreSQL during this test phase");
  }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000 });
  let imported = 0;
  try {
    for (const record of bookings) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const existing = await client.query("select id from public.clients where display_name = $1 limit 1", [record.client.display_name]);
        const clientId = existing.rows[0]?.id ?? (await client.query(
          "insert into public.clients (display_name, maps_url, address) values ($1, $2, $3) returning id",
          [record.client.display_name, record.client.maps_url, record.client.address],
        )).rows[0].id;
        const booking = await client.query(
          "insert into public.bookings (client_id, event_name, event_date, total_amount, paid_amount, status, notes) values ($1, $2, $3, $4, $5, $6, $7) returning id",
          [clientId, record.booking.event_name, record.booking.event_date, record.booking.total_amount, record.booking.paid_amount, record.booking.status, record.booking.notes],
        );
        if (record.payment) await client.query(
          "insert into public.payments (booking_id, amount, payment_date, method) values ($1, $2, $3, $4)",
          [booking.rows[0].id, record.payment.amount, record.payment.payment_date, record.payment.method],
        );
        await client.query("commit");
        imported += 1;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  console.log(`Imported ${imported} booking records.`);
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
