import "server-only";
import { Pool } from "pg";

let pool: Pool | undefined;

export function getLocalPostgresPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL.");

  const databaseUrl = new URL(connectionString);
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  if (process.env.NODE_ENV !== "production" && !isLoopback) {
    throw new Error("Development DATABASE_URL must point to localhost. Use a hosted PostgreSQL URL only in production.");
  }

  pool ??= new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 });
  return pool;
}
