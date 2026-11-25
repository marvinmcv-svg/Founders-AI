import { DATABASE_URL } from "./env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: path.resolve(here, "../drizzle") });
console.log("✓ migrations applied");
await sql.end();
