import { groupSchema, isGroup, type Condition, type FilterNode, type Group, type Product } from "./ast";
import { getField, OPERATORS_BY_TYPE } from "./fields";

export type ValidationIssue = { path: string; message: string };

const NO_VALUE_OPS = new Set(["exists", "not_exists", "is_true", "is_false"]);

function checkCondition(product: Product, c: Condition, path: string, issues: ValidationIssue[]) {
  const field = getField(product, c.field);
  if (!field) {
    issues.push({ path, message: `Unknown field "${c.field}" for ${product}` });
    return;
  }
  if (!OPERATORS_BY_TYPE[field.type].includes(c.operator)) {
    issues.push({ path, message: `Operator "${c.operator}" is not valid for ${field.label}` });
    return;
  }
  if (NO_VALUE_OPS.has(c.operator)) return;
  const v = c.value;
  if (v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === "") {
    issues.push({ path, message: `${field.label}: a value is required` });
    return;
  }
  switch (c.operator) {
    case "any_of":
    case "none_of":
    case "all_of": {
      const values = Array.isArray(v) ? v : [v];
      if (field.options) {
        const allowed = new Set(field.options.map((o) => o.value));
        const bad = values.filter((x) => !allowed.has(String(x)));
        if (bad.length) issues.push({ path, message: `${field.label}: unknown value(s) ${bad.join(", ")}` });
      }
      break;
    }
    case "between": {
      if (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== "number"))
        issues.push({ path, message: `${field.label}: "between" needs [min, max]` });
      break;
    }
    case "gte":
    case "lte":
    case "eq":
    case "neq":
    case "within_last_days": {
      if (typeof v !== "number" || !Number.isFinite(v)) issues.push({ path, message: `${field.label}: a number is required` });
      break;
    }
    case "before":
    case "after": {
      if (typeof v !== "string" || Number.isNaN(Date.parse(v))) issues.push({ path, message: `${field.label}: a date is required` });
      break;
    }
    default:
      break;
  }
}

function walk(product: Product, n: FilterNode, path: string, issues: ValidationIssue[], depth: number) {
  if (depth > 5) {
    issues.push({ path, message: "Filters can be nested at most 5 levels deep" });
    return;
  }
  if (isGroup(n)) n.children.forEach((c, i) => walk(product, c, `${path}.children[${i}]`, issues, depth + 1));
  else checkCondition(product, n, path, issues);
}

/** Structural (zod) + semantic validation against the field registry. Rejects unknown fields. */
export function validateFilter(product: Product, input: unknown): { ok: true; filter: Group } | { ok: false; issues: ValidationIssue[] } {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  const issues: ValidationIssue[] = [];
  walk(product, parsed.data, "filter", issues, 0);
  return issues.length ? { ok: false, issues } : { ok: true, filter: parsed.data };
}
