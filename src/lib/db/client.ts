import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * DATABASE_URL set  → Postgres (Neon, Supabase, RDS, local Docker) via postgres.js.
 * DATABASE_URL unset → embedded PGlite in .data/ so the app runs with zero setup.
 * PGlite is for local development only; serverless filesystems are ephemeral.
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __examwebDb?: Promise<DB> };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
    return drizzle(sql, { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  return (g.__examwebDb ??= connect().catch((e) => {
    g.__examwebDb = undefined;
    throw e;
  }));
}
