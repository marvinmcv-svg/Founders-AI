import { isGroup, type Condition, type FilterNode, type Product } from "./ast";
import { getField, OPERATOR_LABELS, optionLabel, type FieldDef } from "./fields";
import { int, usd } from "../format";

function fmtValue(field: FieldDef, v: unknown): string {
  if (field.type === "money") return usd(Number(v));
  if (field.type === "percent") return `${v}%`;
  if (field.type === "number") return int(Number(v));
  if (field.options) return optionLabel(field, String(v));
  return String(v);
}

/** Human chip text for one condition, e.g. "Growth Stage is any of Pre-seed / Seed, Early". */
export function describeCondition(product: Product, c: Condition, listNames?: Record<string, string>): string {
  const field = getField(product, c.field);
  if (!field) return c.field;
  const op = OPERATOR_LABELS[c.operator];
  const v = c.value;
  switch (c.operator) {
    case "exists":
    case "not_exists":
    case "is_true":
    case "is_false":
      return `${field.label} ${op}`;
    case "between": {
      const [a, b] = Array.isArray(v) ? v : [];
      return `${field.label} between ${fmtValue(field, a)} and ${fmtValue(field, b)}`;
    }
    case "within_last_days":
      return `${field.label} within last ${v} days`;
    case "in_list":
    case "not_in_list":
      return `${op[0]?.toUpperCase()}${op.slice(1)} ${listNames?.[String(v)] ?? String(v)}`;
    default: {
      const values = Array.isArray(v) ? v : [v];
      const shown = values.slice(0, 3).map((x) => fmtValue(field, x));
      const more = values.length > 3 ? ` +${values.length - 3}` : "";
      return `${field.label} ${op} ${shown.join(", ")}${more}`;
    }
  }
}

export function describeFilter(product: Product, node: FilterNode, listNames?: Record<string, string>): string {
  if (!isGroup(node)) return describeCondition(product, node, listNames);
  const parts = node.children.map((c) => {
    const s = describeFilter(product, c, listNames);
    return isGroup(c) && c.children.length > 1 ? `(${s})` : s;
  });
  return parts.join(node.op === "AND" ? " and " : " or ");
}
