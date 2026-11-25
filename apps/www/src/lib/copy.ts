/**
 * Copy keys (plan Rule 8). Every UI string comes from /content/copy/en.json via t(<page.section.slot>).
 * Missing keys render the visible placeholder [TODO-COPY key]; `pnpm copy:check` fails on any.
 */
import en from "../../../../content/copy/en.json";
import { brand } from "@founders/config";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function lookup(key: string): Json | undefined {
  let cur: Json | undefined = en as unknown as Json;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) cur = (cur as Record<string, Json>)[part];
    else return undefined;
  }
  return cur;
}

export type Vars = Record<string, string | number>;

export function fill(s: string, vars: Vars = {}): string {
  return s.replace(/\{([\w.]+)\}/g, (m, k: string) => {
    if (k === "brand") return brand.name;
    const v = vars[k];
    return v === undefined ? m : String(v);
  });
}

export function t(key: string, vars?: Vars): string {
  const v = lookup(key);
  if (typeof v !== "string") return `[TODO-COPY ${key}]`;
  return fill(v, vars);
}

export function tList(key: string, vars?: Vars): string[] {
  const v = lookup(key);
  return Array.isArray(v) ? v.map((x) => fill(String(x), vars)) : [];
}

export function tObjects<T>(key: string): T[] {
  const v = lookup(key);
  return Array.isArray(v) ? (v as unknown as T[]) : [];
}
