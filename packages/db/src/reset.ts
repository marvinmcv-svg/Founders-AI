import { DATABASE_URL } from "./env";
import postgres from "postgres";

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
console.log("✓ database reset");
await sql.end();
