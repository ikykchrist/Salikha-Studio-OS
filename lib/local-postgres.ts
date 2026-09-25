import "server-only";
import { Pool } from "pg";

let pool: Pool | undefined;

export function getLocalPostgresPool() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL.");

  const databaseUrl = new URL(connectionString);
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  const ca = process.env.POSTGRES_CA_CERT?.replace(/\\n/g, "\n");
  const poolConnectionString = ca ? (() => {
    ["sslmode", "sslrootcert", "sslcert", "sslkey"].forEach((key) => databaseUrl.searchParams.delete(key));
    return databaseUrl.toString();
  })() : connectionString;
  if (process.env.NODE_ENV !== "production" && !isLoopback) {
    throw new Error("Development DATABASE_URL must point to localhost. Use a hosted PostgreSQL URL only in production.");
  }

  pool ??= new Pool({
    connectionString: poolConnectionString,
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  });
  return pool;
}
