import { getDb, getSql } from "@founders/db";
import type { SQL } from "drizzle-orm";

export type Row = Record<string, unknown>;

export async function q<T = Row>(query: SQL): Promise<T[]> {
  return (await getDb().execute(query)) as unknown as T[];
}

/** Raw postgres.js client for bulk work (COPY-like multi-row inserts, unnest updates). */
export const pg = () => getSql();
