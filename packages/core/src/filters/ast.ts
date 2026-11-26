/**
 * Filter AST (plan 7.4): Group{op, children} / Condition{field, operator, value, timeframe?}.
 * Same structure is used by the app filter builder, saved searches, NL search, API and MCP.
 */
import { z } from "zod";

export const PRODUCTS = ["companies", "people", "investors", "funding_rounds", "talent_signals", "acquisitions", "ipos", "news_signals", "interest_signals"] as const;
export type Product = (typeof PRODUCTS)[number];

export const OPERATORS = [
  // text
  "contains",
  "is",
  "is_not",
  "starts_with",
  // enum / taxonomy / arrays
  "any_of",
  "none_of",
  "all_of",
  // number
  "eq",
  "neq",
  "gte",
  "lte",
  "between",
  // date
  "before",
  "after",
  "within_last_days",
  // boolean
  "is_true",
  "is_false",
  // existence
  "exists",
  "not_exists",
  // org-scoped relations
  "in_list",
  "not_in_list",
] as const;
export type Operator = (typeof OPERATORS)[number];

export type Scalar = string | number | boolean;
export type ConditionValue = Scalar | Scalar[] | [number, number] | null | undefined;

export type Condition = {
  kind: "condition";
  field: string;
  operator: Operator;
  value?: ConditionValue;
};

export type Group = {
  kind: "group";
  op: "AND" | "OR";
  children: FilterNode[];
};

export type FilterNode = Group | Condition;

export const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

export const conditionSchema = z.object({
  kind: z.literal("condition"),
  field: z.string().min(1).max(64),
  operator: z.enum(OPERATORS),
  value: z.union([scalarSchema, z.array(scalarSchema).max(500), z.null()]).optional(),
});

export const groupSchema: z.ZodType<Group> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    op: z.enum(["AND", "OR"]),
    children: z.array(z.union([conditionSchema, groupSchema])).max(50),
  }),
) as z.ZodType<Group>;

export const filterNodeSchema = z.union([conditionSchema, groupSchema]);

export const emptyFilter = (): Group => ({ kind: "group", op: "AND", children: [] });

export function isGroup(n: FilterNode): n is Group {
  return n.kind === "group";
}

/** Count leaf conditions (used for the "Add Filter (n)" badge). */
export function countConditions(n: FilterNode): number {
  return isGroup(n) ? n.children.reduce((acc, c) => acc + countConditions(c), 0) : 1;
}

/** Depth-first list of all conditions. */
export function flattenConditions(n: FilterNode): Condition[] {
  return isGroup(n) ? n.children.flatMap(flattenConditions) : [n];
}

/** URL-safe base64 encoding for shareable grid state (works in Node and browsers). */
export function encodeFilter(g: Group): string {
  const bytes = new TextEncoder().encode(JSON.stringify(g));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeFilter(s: string | null | undefined): Group {
  if (!s) return emptyFilter();
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const parsed = groupSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : emptyFilter();
  } catch {
    return emptyFilter();
  }
}
