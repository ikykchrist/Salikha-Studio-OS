import "server-only";
import { Pool } from "pg";

let pool: Pool | undefined;

export function getLocalPostgresPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for the local PostgreSQL database.");

  const databaseUrl = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("DATABASE_URL must point to localhost; external databases are disabled for this test phase.");
  }

  pool ??= new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 });
  return pool;
}
