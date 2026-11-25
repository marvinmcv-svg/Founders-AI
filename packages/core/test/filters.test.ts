import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { compileFilter, compileSort } from "../src/filters/compile";
import { decodeFilter, encodeFilter, FIELDS, OPERATORS_BY_TYPE, validateFilter, describeFilter, type Condition, type Group } from "../src/filters";

const dialect = new PgDialect();
const sqlOf = (g: Group, orgId?: string) => dialect.sqlToQuery(compileFilter("companies", g, { orgId }));
const one = (c: Omit<Condition, "kind">): Group => ({ kind: "group", op: "AND", children: [{ kind: "condition", ...c }] });

describe("filter compiler — every operator", () => {
  const cases: [Omit<Condition, "kind">, RegExp, unknown[]][] = [
    [{ field: "name", operator: "contains", value: "pay_%" }, /t\.name ILIKE \$1/, ["%pay\\_\\%%"]],
    [{ field: "name", operator: "starts_with", value: "Lu" }, /ILIKE \$1/, ["Lu%"]],
    [{ field: "name", operator: "is", value: "Lumora" }, /lower\(t\.name\) = lower\(\$1\)/, ["Lumora"]],
    [{ field: "name", operator: "is_not", value: "X" }, /t\.name IS NULL OR lower/, ["X"]],
    [{ field: "growth_stage", operator: "any_of", value: ["Early", "Growth"] }, /t\.growth_stage = ANY\(ARRAY\[\$1, \$2\]::text\[\]\)/, ["Early", "Growth"]],
    [{ field: "growth_stage", operator: "none_of", value: ["Late"] }, /IS NULL OR NOT/, ["Late"]],
    [{ field: "business_models", operator: "any_of", value: ["SaaS"] }, /t\.business_models && ARRAY/, ["SaaS"]],
    [{ field: "business_models", operator: "all_of", value: ["SaaS", "Marketplace"] }, /t\.business_models @> ARRAY/, ["SaaS", "Marketplace"]],
    [{ field: "business_models", operator: "none_of", value: ["SaaS"] }, /NOT \(t\.business_models && ARRAY/, ["SaaS"]],
    [{ field: "employee_count", operator: "gte", value: 50 }, /t\.employee_count >= \$1/, [50]],
    [{ field: "employee_count", operator: "lte", value: 10 }, /<= \$1/, [10]],
    [{ field: "employee_count", operator: "eq", value: 7 }, /= \$1/, [7]],
    [{ field: "employee_count", operator: "neq", value: 7 }, /IS NULL OR t\.employee_count <> \$1/, [7]],
    [{ field: "employee_count", operator: "between", value: [10, 50] }, /BETWEEN \$1 AND \$2/, [10, 50]],
    [{ field: "headcount_growth_3m", operator: "gte", value: 25 }, /headcount_growth_3m >= \$1/, [0.25]],
    [{ field: "last_funding_date", operator: "before", value: "2025-01-01" }, /< \$1::date/, ["2025-01-01"]],
    [{ field: "last_funding_date", operator: "after", value: "2025-01-01" }, /> \$1::date/, ["2025-01-01"]],
    [{ field: "last_funding_date", operator: "within_last_days", value: 90 }, /CURRENT_DATE - \$1::int/, [90]],
    [{ field: "bootstrapped", operator: "is_true" }, /bootstrapped IS TRUE/, []],
    [{ field: "bootstrapped", operator: "is_false" }, /IS NOT TRUE/, []],
    [{ field: "description", operator: "exists" }, /t\.description IS NOT NULL/, []],
    [{ field: "highlights", operator: "not_exists" }, /cardinality\(t\.highlights\) = 0/, []],
  ];
  for (const [c, re, params] of cases) {
    it(`${c.field} ${c.operator}`, () => {
      const q = sqlOf(one(c));
      expect(q.sql).toMatch(re);
      expect(q.params).toEqual(params);
    });
  }

  it("lists are org-scoped and match nothing without an org", () => {
    const g = one({ field: "list", operator: "in_list", value: "lst_1" });
    expect(sqlOf(g).sql).toBe("FALSE");
    const q = sqlOf(g, "org_a");
    expect(q.sql).toMatch(/l\.org_id = \$2/);
    expect(q.params).toEqual(["lst_1", "org_a"]);
  });

  it("nests AND/OR groups", () => {
    const g: Group = { kind: "group", op: "AND", children: [
      { kind: "group", op: "OR", children: [
        { kind: "condition", field: "hq_country", operator: "any_of", value: ["Bolivia"] },
        { kind: "condition", field: "hq_country", operator: "any_of", value: ["Paraguay"] },
      ] },
      { kind: "condition", field: "employee_count", operator: "lte", value: 10 },
    ] };
    expect(sqlOf(g).sql).toMatch(/^\(\(.+ OR .+\) AND t\.employee_count <= \$3\)$/);
  });

  it("empty filter is TRUE and unknown sort falls back to default", () => {
    expect(sqlOf({ kind: "group", op: "AND", children: [] }).sql).toBe("TRUE");
    expect(dialect.sqlToQuery(compileSort("companies", { field: "evil; drop", dir: "asc" })).sql).toBe("t.rank ASC NULLS LAST, t.id ASC");
  });

  it("every field type has operators and every operator compiles", () => {
    for (const f of FIELDS.companies) for (const op of OPERATORS_BY_TYPE[f.type]) {
      const value = op === "between" ? [1, 2] : ["gte", "lte", "eq", "neq", "within_last_days"].includes(op) ? 1 : ["before", "after"].includes(op) ? "2025-01-01" : f.options ? [f.options[0]!.value] : "x";
      expect(() => sqlOf(one({ field: f.key, operator: op, value }), "org")).not.toThrow();
    }
  });
});

describe("validation, encoding, describing", () => {
  it("rejects unknown fields, bad operators and unknown enum values", () => {
    expect(validateFilter("companies", one({ field: "nope", operator: "is", value: "x" })).ok).toBe(false);
    expect(validateFilter("companies", one({ field: "employee_count", operator: "contains", value: "x" })).ok).toBe(false);
    expect(validateFilter("companies", one({ field: "growth_stage", operator: "any_of", value: ["Mega"] })).ok).toBe(false);
    expect(validateFilter("companies", one({ field: "growth_stage", operator: "any_of", value: ["Early"] })).ok).toBe(true);
  });
  it("round-trips through the URL encoding (incl. unicode)", () => {
    const g = one({ field: "hq_city", operator: "contains", value: "São Paulo" });
    expect(decodeFilter(encodeFilter(g))).toEqual(g);
    expect(decodeFilter("garbage!!")).toEqual({ kind: "group", op: "AND", children: [] });
  });
  it("describes conditions as chips", () => {
    expect(describeFilter("companies", one({ field: "total_funding_usd", operator: "gte", value: 5_000_000 }))).toBe("Total Funding (USD) ≥ $5M");
  });
});
