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
    globalForDb.__foundersSql = postgres(url(), { max: 10, prepare: true, onnotice: () => {} });
  }
  return globalForDb.__foundersSql;
}

export function getDb(): Db {
  if (!globalForDb.__foundersDb) {
    globalForDb.__foundersDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__foundersDb;
}
