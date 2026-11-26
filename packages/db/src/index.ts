import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __foundersSql?: postgres.Sql; __foundersDb?: Db };

function url() {
  return process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/founders";
}

/** Shared connection (one per process; survives Next.js dev HMR). */
export function getSql(): postgres.Sql {
  if (!globalForDb.__foundersSql) {
    const u = url();
    const local = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(u);
    globalForDb.__foundersSql = postgres(u, {
      // Serverless: few connections per instance; hosted DBs need TLS; transaction poolers (:6543) can't use prepared statements.
      max: process.env.VERCEL ? 3 : 10,
      prepare: !u.includes(":6543"),
      ssl: local ? false : "require",
      idle_timeout: process.env.VERCEL ? 20 : undefined,
      onnotice: () => {},
      // Return int8/numeric as JS numbers (all our amounts fit in 2^53).
      types: { bigint: { to: 20, from: [20, 1700], parse: (x: string) => Number(x), serialize: (x: number) => String(x) } },
    });
  }
  return globalForDb.__foundersSql;
}

export function getDb(): Db {
  if (!globalForDb.__foundersDb) {
    globalForDb.__foundersDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__foundersDb;
}
