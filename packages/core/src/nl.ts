/**
 * Natural language → filter AST (plan 10.3). `nlToQuery(text, product?)` →
 * { product, filter, sort, explanation, engine }. Claude (structured output) when a key is
 * configured, validated against the field registry; deterministic keyword parser otherwise or
 * when the model's output fails validation. Same function powers the app, API POST /search, MCP.
 */
import { PRODUCTS, type Condition, type Group, type Product } from "./filters/ast";
import type { SortSpec } from "./filters/compile";
import { FIELDS, OPERATORS_BY_TYPE, PRODUCT_META } from "./filters/fields";
import { validateFilter } from "./filters/validate";
import { structuredCall } from "./llm";
import {
  BUSINESS_MODELS,
  CUSTOMER_FOCUS,
  GEOGRAPHY,
  INVESTOR_TYPES,
  PEOPLE_HIGHLIGHTS,
  ROUND_TYPES,
  TAXONOMY,
} from "./taxonomy";

export type NlResult = {
  product: Product;
  filter: Group;
  sort: SortSpec | null;
  explanation: string;
  engine: "claude" | "rules";
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Filter key for "in <country>" per product (the entity's own country, or its company's). */
const COUNTRY_KEY: Record<Product, string> = {
  companies: "hq_country",
  people: "country",
  investors: "hq_country",
  funding_rounds: "company_country",
  talent_signals: "person_country",
  acquisitions: "target_country",
  ipos: "company_country",
  news_signals: "company_country",
};
const DATE_KEY: Partial<Record<Product, string>> = {
  funding_rounds: "announced_date",
  talent_signals: "signal_date",
  acquisitions: "date",
  ipos: "date",
  news_signals: "published_at",
};
const COMPANY_CONTEXT_PREFIX: Partial<Record<Product, string>> = { funding_rounds: "company", acquisitions: "target", ipos: "company", news_signals: "company" };

function detectProduct(t: string): Product {
  if (/\b(stealth|talent signal|left (their|his|her) job|new compan(y|ies) founded|just (started|founded))\b/.test(t)) return "talent_signals";
  if (/\b(acquisitions?|acquired|m&a|exits? by acquisition|adquisicion(es)?)\b/.test(t)) return "acquisitions";
  if (/\b(ipos?|went public|listings?|salida a bolsa)\b/.test(t)) return "ipos";
  if (/\b(news|headlines?|press|noticias)\b/.test(t)) return "news_signals";
  if (/\b(investors?|vcs?|funds?|angels?|backers?|family offices?|accelerators?)\b/.test(t) && !/\bcompan(y|ies) (backed|funded)\b/.test(t)) return "investors";
  if (/\b(rounds?|deals?|financings?|raised in|transactions?)\b/.test(t) && !/\bcompan/.test(t)) return "funding_rounds";
  if (/\b(founders?|people|persons?|engineers?|ctos?|ceos?|executives?|operators?|talent)\b/.test(t)) return "people";
  return "companies";
}

function money(t: string): number | null {
  const m = t.match(/\$?\s?(\d+(?:\.\d+)?)\s?(k|m|mm|b|bn|million|billion|thousand)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  if (unit.startsWith("b")) return n * 1e9;
  if (unit.startsWith("m")) return n * 1e6;
  if (unit.startsWith("k") || unit === "thousand") return n * 1e3;
  return n;
}

/** Deterministic parser — good coverage of common investor phrasing (EN + some ES). */
export function parseRules(text: string, forced?: Product): NlResult {
  const t = norm(text);
  const product = forced ?? detectProduct(t);
  const children: Condition[] = [];
  const add = (field: string, operator: Condition["operator"], value?: Condition["value"]) => {
    if (FIELDS[product].some((f) => f.key === field)) children.push({ kind: "condition", field, operator, value });
  };
  const notes: string[] = [];

  // Geography
  const countries = GEOGRAPHY.filter((g) => t.includes(norm(g.country)) || g.cities.some((c) => t.includes(norm(c)))).map((g) => g.country);
  const latam = /\b(latam|latin america|latinoamerica|south america|sudamerica)\b/.test(t);
  if (countries.length) {
    add(COUNTRY_KEY[product], "any_of", [...new Set(countries)]);
    notes.push(`in ${countries.join(", ")}`);
  } else if (latam) {
    if (product === "companies") add("hq_region", "any_of", ["Latin America"]);
    else if (product === "investors") add("geographies", "any_of", ["Latin America"]);
    else {
      add(COUNTRY_KEY[product], "any_of", GEOGRAPHY.filter((g) => g.region === "Latin America").map((g) => g.country));
    }
    notes.push("in Latin America");
  }

  // Taxonomy: verticals, industries, sectors (longest names first)
  const verticals = TAXONOMY.verticals.filter((v) => {
    const n = norm(v.name);
    const short = n.split(/[ ,&]+/).filter((w) => w.length > 3);
    return t.includes(n) || (short.length > 0 && short.slice(0, 2).every((w) => t.includes(w)));
  });
  const keywordVerticals: [RegExp, string][] = [
    [/\b(ai agents?|agentic|copilots?)\b/, "AI Agents and Process Copilots"],
    [/\bstablecoins?|crypto\b/, "Stablecoins & Digital Assets"],
    [/\bremittances?|cross[- ]border\b/, "Cross-border Payments & Remittances"],
    [/\bpayments? (infra|infrastructure|api)/, "Banking and Payment Infrastructure APIs"],
    [/\bbnpl|buy now pay later\b/, "Buy Now Pay Later"],
    [/\bvector (db|database)/, "Vector Databases & AI Data Stacks"],
    [/\b(agtech|agro|agri|farm|farming|soy|cattle|ganaderia)\b/, "Precision Agriculture"],
    [/\bcarbon\b/, "Carbon Accounting"],
    [/\b(telemedicine|telehealth)\b/, "Telemedicine"],
    [/\bfreight|trucking\b/, "Freight Marketplaces"],
  ];
  for (const [re, name] of keywordVerticals) if (re.test(t)) {
    const v = TAXONOMY.verticals.find((x) => x.name === name);
    if (v && !verticals.includes(v)) verticals.push(v);
  }
  const industryHits = TAXONOMY.industries.filter((i) => t.includes(norm(i.name)));
  const sectorKeywords: [RegExp, string][] = [
    [/\bfintech|financial services|finanzas\b/, "Financial Services"],
    [/\b(ai|artificial intelligence|inteligencia artificial|machine learning)\b/, "Artificial Intelligence"],
    [/\b(health|healthtech|salud)\b/, "Health & Life Sciences"],
    [/\b(saas|software|devtools?)\b/, "Software & Internet"],
    [/\b(ecommerce|e-commerce|retail|consumer)\b/, "Commerce & Consumer"],
    [/\b(climate|energy|energia|solar)\b/, "Climate & Energy"],
    [/\b(logistics|logistica|mobility)\b/, "Mobility & Logistics"],
    [/\b(edtech|education|educacion)\b/, "Education & Work"],
    [/\b(proptech|real estate|construction)\b/, "Real Estate & Construction"],
    [/\b(agtech|agriculture|agricultura|agro)\b/, "Agriculture & Food Systems"],
  ];
  const sectors = sectorKeywords.filter(([re]) => re.test(t)).map(([, s]) => TAXONOMY.sectors.find((x) => x.name === s)?.id).filter((x): x is string => Boolean(x));

  const ctxPrefix = COMPANY_CONTEXT_PREFIX[product];
  if (product === "companies" || ctxPrefix) {
    const vKey = product === "companies" ? "tech_vertical" : `${ctxPrefix}_tech_vertical`;
    const sKey = product === "companies" ? "sector" : `${ctxPrefix}_sector`;
    if (verticals.length) {
      add(vKey, "any_of", verticals.map((v) => v.id));
      notes.push(verticals.map((v) => v.name).join(" / "));
    } else if (industryHits.length && product === "companies") {
      add("industry", "any_of", industryHits.map((i) => i.id));
      notes.push(industryHits.map((i) => i.name).join(" / "));
    } else if (sectors.length) {
      add(sKey, "any_of", sectors);
      notes.push("sector match");
    }
  } else if (product === "investors" && sectors.length) {
    add("sectors", "any_of", sectors);
  }

  // Stage / round type
  const stageMap: [RegExp, string][] = [
    [/\b(pre-?seed|seed|semilla)\b/, "Pre-seed / Seed"],
    [/\b(early[- ]stage|series a)\b/, "Early"],
    [/\b(growth[- ]stage|series [bc])\b/, "Growth"],
    [/\b(late[- ]stage|series [de]|pre-?ipo)\b/, "Late"],
  ];
  const stages = stageMap.filter(([re]) => re.test(t)).map(([, s]) => s);
  if (stages.length) {
    if (product === "companies") add("growth_stage", "any_of", stages);
    if (product === "investors") add("target_stages", "any_of", stages);
  }
  if (product === "funding_rounds") {
    const types = ROUND_TYPES.filter((r) => t.includes(norm(r)));
    if (types.length) add("type", "any_of", [...types]);
  }

  // Business model / customer focus
  const models = BUSINESS_MODELS.filter((m) => new RegExp(`\\b${norm(m)}s?\\b`).test(t));
  if (models.length && product === "companies") add("business_models", "any_of", [...models]);
  const focus = CUSTOMER_FOCUS.filter((f) => new RegExp(`\\b${f.toLowerCase()}\\b`).test(t));
  if (focus.length && product === "companies") add("customer_focus", "any_of", [...focus]);
  if (/\bbootstrapped\b/.test(t) && product === "companies") add("bootstrapped", "is_true");

  // Growth & highlights
  if (product === "companies") {
    if (/\b(headcount surge|hiring fast|rapidly hiring|fast[- ]growing|fastest[- ]growing|growing fast|high growth)\b/.test(t)) add("headcount_growth_3m", "gte", 15);
    if (/\b(web traffic|traffic growth)\b/.test(t)) add("web_visits_growth_3m", "gte", 25);
    if (/\b(top[- ]tier|tier[- ]1) (vc|investors|backed)\b/.test(t)) add("highlights", "any_of", ["top_tier_investors"]);
    if (/\b(recently funded|just raised|raised recently)\b/.test(t)) add("highlights", "any_of", ["recently_funded"]);
    if (/\b(not raised|no recent funding|haven'?t raised)\b/.test(t)) add("highlights", "any_of", ["no_recent_funding"]);
  }
  if (product === "people" || product === "talent_signals") {
    const key = product === "people" ? "highlights" : "person_highlights";
    const hs = PEOPLE_HIGHLIGHTS.filter((h) => t.includes(norm(h)));
    if (/\bserial\b/.test(t) && !hs.includes("Serial Founder")) hs.push("Serial Founder");
    if (/\b(exited|prior exit|exit)\b/.test(t) && !hs.includes("Prior Exit")) hs.push("Prior Exit");
    if (/\b(big tech|ex-?faang|major tech)\b/.test(t) && !hs.includes("Major Tech Experience")) hs.push("Major Tech Experience");
    if (hs.length) add(key, "any_of", [...new Set(hs)]);
    if (product === "people" && /\bfounders?\b/.test(t)) add("seniority", "any_of", ["Founder"]);
    if (product === "people" && /\b(cto|ceo|c-level|executives?)\b/.test(t)) add("seniority", "any_of", ["C-Level", "Founder"]);
  }
  if (product === "talent_signals") {
    if (/\bstealth\b/.test(t)) add("status", "any_of", ["STEALTH"]);
    if (/\b(new compan|founded|starting)\b/.test(t)) add("type", "any_of", ["NEW_COMPANY"]);
  }
  if (product === "investors") {
    const types = INVESTOR_TYPES.filter((x) => new RegExp(`\\b${norm(x)}s?\\b`).test(t));
    if (/\bvcs?\b/.test(t) && !types.includes("VC")) types.push("VC");
    if (types.length) add("type", "any_of", [...new Set(types)]);
    if (/\b(lead|leads)\b/.test(t)) add("highlights", "any_of", ["Lead investor"]);
    if (/\b(tier[- ]?1|top[- ]tier)\b/.test(t)) add("highlights", "any_of", ["Tier-1"]);
  }

  // Amounts
  const amt = money(t);
  if (amt) {
    const over = /\b(over|more than|above|at least|>|mas de|minimum)\b/.test(t);
    const under = /\b(under|less than|below|<|menos de|up to)\b/.test(t);
    const key = product === "companies" ? (/\b(revenue|arr|ingresos)\b/.test(t) ? "est_revenue_usd" : "total_funding_usd") : product === "funding_rounds" || product === "acquisitions" ? "amount_usd" : product === "ipos" ? "raised_usd" : product === "investors" ? "aum_usd" : null;
    if (key) add(key, under && !over ? "lte" : "gte", amt);
  }
  const emp = t.match(/(\d+)\+?\s*(employees|people|staff|empleados)/);
  if (emp && product === "companies") add("employee_count", /\b(under|less than|fewer than)\b/.test(t) ? "lte" : "gte", Number(emp[1]));
  const founded = t.match(/founded (after|since|in) (\d{4})/);
  if (founded && product === "companies") add("founded_year", founded[1] === "in" ? "eq" : "gte", Number(founded[2]));

  // Recency
  const days = t.match(/last (\d+) (days|weeks|months)/);
  const recentDays = days ? Number(days[1]) * (days[2] === "weeks" ? 7 : days[2] === "months" ? 30 : 1) : /\b(this month|recent(ly)?)\b/.test(t) ? 30 : /\bthis year\b/.test(t) ? 365 : null;
  if (recentDays) {
    const dateKey = DATE_KEY[product];
    if (dateKey) add(dateKey, "within_last_days", recentDays);
    if (product === "companies" && /\b(raised|funded|round)\b/.test(t)) add("last_funding_date", "within_last_days", recentDays);
  }
  if (product === "news_signals") {
    if (/\b(major|big|important|biggest)\b/.test(t)) add("is_major", "is_true", null);
    const cat = (["funding", "revenue", "profitability", "traction"] as const).find((c) => t.includes(c));
    if (cat) add("category", "any_of", [cat]);
    else if (/\b(m&a|acquisitions?|partnerships?|deals?)\b/.test(t)) add("category", "any_of", ["deals"]);
  }

  // Sorting hints
  let sort: SortSpec | null = null;
  if (/\b(fastest[- ]growing|top growth|growing fastest)\b/.test(t) && product === "companies") sort = { field: "headcount_growth_3m", dir: "desc" };
  if (/\b(most funded|biggest|largest)\b/.test(t) && product === "companies") sort = { field: "total_funding_usd", dir: "desc" };

  // De-duplicate conditions on the same field+operator (keep the first).
  const seen = new Set<string>();
  const unique = children.filter((c) => {
    const k = `${c.field}:${c.operator}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const label = PRODUCT_META[product].label;
  return {
    product,
    filter: { kind: "group", op: "AND", children: unique },
    sort,
    explanation: unique.length ? `${label}${notes.length ? ` — ${notes.join(", ")}` : ""} (${unique.length} filter${unique.length === 1 ? "" : "s"})` : `${label} — no specific filters recognised; try naming a sector, stage, country or amount`,
    engine: "rules",
  };
}

function schemaFor() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["product", "op", "conditions", "sort_field", "sort_dir", "explanation"],
    properties: {
      product: { type: "string", enum: [...PRODUCTS] },
      op: { type: "string", enum: ["AND", "OR"] },
      conditions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "operator", "values", "number", "number_max", "text"],
          properties: {
            field: { type: "string" },
            operator: { type: "string" },
            values: { type: "array", items: { type: "string" } },
            number: { type: ["number", "null"] },
            number_max: { type: ["number", "null"] },
            text: { type: ["string", "null"] },
          },
        },
      },
      sort_field: { type: ["string", "null"] },
      sort_dir: { type: ["string", "null"], enum: ["asc", "desc", null] },
      explanation: { type: "string" },
    },
  };
}

function registryPrompt(): string {
  return PRODUCTS.map((p) => {
    const fields = FIELDS[p]
      .filter((f) => f.type !== "list")
      .map((f) => {
        const ops = OPERATORS_BY_TYPE[f.type].join("|");
        const values = f.options && f.options.length <= 60 ? ` values=[${f.options.map((o) => (o.value === o.label ? o.value : `${o.value}=${o.label}`)).join("; ")}]` : "";
        return `  - ${f.key} (${f.type}; ops: ${ops})${values}`;
      })
      .join("\n");
    return `${p}:\n${fields}`;
  }).join("\n\n");
}

type LlmOut = {
  product: Product;
  op: "AND" | "OR";
  conditions: { field: string; operator: string; values: string[]; number: number | null; number_max: number | null; text: string | null }[];
  sort_field: string | null;
  sort_dir: "asc" | "desc" | null;
  explanation: string;
};

const SYSTEM = `You convert an investor's plain-language request into a database filter for a private-markets platform.
Pick the product (dataset) that best answers the request, then emit conditions using ONLY the fields, operators and option values listed below.
Rules:
- Enum/multi fields: put option values (the part before "=" when shown) in "values".
- Number, money (whole USD) and percent (percentage points, e.g. 25 for 25%) fields: use "number" (and "number_max" for between).
- Date fields: "within_last_days" uses "number"; before/after use "text" as YYYY-MM-DD.
- Text fields: use "text".
- Only add conditions the request actually implies. Never invent a field. If nothing maps, return no conditions.
- "explanation" is one short sentence describing the filter in plain English.
Fields:
${registryPrompt()}`;

/** NL → AST. Claude first (if configured), validated; falls back to the rules parser. */
export async function nlToQuery(text: string, product?: Product): Promise<NlResult> {
  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) return parseRules("", product);
  try {
    const out = await structuredCall<LlmOut>({
      system: SYSTEM,
      user: product ? `Dataset: ${product}\nRequest: ${trimmed}` : `Request: ${trimmed}`,
      schema: schemaFor(),
      maxTokens: 4000,
      effort: "low",
    });
    if (out) {
      const p = product ?? out.product;
      const children: Condition[] = out.conditions.map((c) => {
        const field = FIELDS[p].find((f) => f.key === c.field);
        let value: Condition["value"];
        if (c.operator === "between") value = [c.number ?? 0, c.number_max ?? 0];
        else if (field && ["number", "money", "percent"].includes(field.type)) value = c.number ?? undefined;
        else if (c.operator === "within_last_days") value = c.number ?? undefined;
        else if (c.values.length) value = c.values;
        else value = c.text ?? undefined;
        return { kind: "condition", field: c.field, operator: c.operator as Condition["operator"], value };
      });
      const filter: Group = { kind: "group", op: out.op, children };
      const v = validateFilter(p, filter);
      if (v.ok) {
        const sortable = out.sort_field && FIELDS[p].some((f) => f.key === out.sort_field && f.sortable);
        return {
          product: p,
          filter: v.filter,
          sort: sortable && out.sort_field ? { field: out.sort_field, dir: out.sort_dir ?? "desc" } : null,
          explanation: out.explanation,
          engine: "claude",
        };
      }
    }
  } catch {
    // Network/API errors fall through to the deterministic parser.
  }
  return parseRules(trimmed, product);
}
