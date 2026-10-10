/** Applies SQL migrations in ./drizzle to DATABASE_URL. Runs on every Vercel build. */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set; skipping migrations (local PGlite migrates itself).");
  process.exit(0);
}
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
await sql.end();
console.log("Migrations applied.");
