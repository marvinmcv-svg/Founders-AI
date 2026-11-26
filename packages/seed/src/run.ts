/** `pnpm db:seed` — idempotent; scale with SEED_SCALE (default 1 = plan sizes). */
import { DATABASE_URL } from "@founders/db/env";
import postgres from "postgres";
import { seedDatabase } from "./load";
import { DEMO } from "./demo";

const scale = Number(process.env.SEED_SCALE ?? "1");
const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
console.log(`Seeding synthetic universe (scale ${scale})…`);
const stats = await seedDatabase(sql, { scale, log: (l) => console.log(`  ${l}`) });
console.log("platform_stats:", stats);
console.log(`  demo workspace: ${DEMO.email} / ${DEMO.password}  ·  API key ${DEMO.apiKey}`);
await sql.end();
process.exit(0);
