/**
 * Static taxonomy seed (plan 7.4). Loaded into `taxonomy_nodes` by the seed and used by the
 * filter picker, NL parser and generator. Sector › Industry, Tech Verticals, Ecosystems.
 */

export type TaxNode = { id: string; name: string; parentId?: string };

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const SECTOR_TREE: Record<string, string[]> = {
  "Financial Services": [
    "Financial Technology",
    "Payments",
    "Lending & Credit",
    "Insurance Technology",
    "Wealth & Asset Management",
    "Banking Infrastructure",
  ],
  "Software & Internet": [
    "Developer Tools",
    "Enterprise Software",
    "Collaboration & Productivity",
    "Cybersecurity",
    "Data & Analytics",
    "Marketing Technology",
  ],
  "Artificial Intelligence": ["Foundation Models", "Applied AI", "AI Infrastructure", "Computer Vision"],
  "Health & Life Sciences": ["Digital Health", "Biotechnology", "Medical Devices", "Health Insurance & Benefits"],
  "Commerce & Consumer": ["E-commerce", "Marketplaces", "Consumer Apps", "Food & Beverage", "Retail Technology"],
  "Climate & Energy": ["Renewable Energy", "Carbon & Climate Software", "Energy Storage", "Water"],
  "Agriculture & Food Systems": ["AgTech", "Agricultural Supply Chain", "Alternative Proteins"],
  "Mobility & Logistics": ["Logistics & Freight", "Last-Mile Delivery", "Mobility & Transport"],
  "Real Estate & Construction": ["PropTech", "Construction Technology"],
  "Education & Work": ["EdTech", "HR & Recruiting Tech", "Future of Work"],
  "Industrials & Hardware": ["Robotics", "Manufacturing Technology", "Semiconductors", "Aerospace & Defense"],
  "Media & Entertainment": ["Creator Economy", "Gaming", "Streaming & Media"],
};

export const TECH_VERTICALS = [
  "AI Agents and Process Copilots",
  "Vector Databases & AI Data Stacks",
  "LLM Ops & Evaluation",
  "Build, Test, CI/CD and Release",
  "Observability & Monitoring",
  "Banking and Payment Infrastructure APIs",
  "Stablecoins & Digital Assets",
  "Cross-border Payments & Remittances",
  "Embedded Finance",
  "Buy Now Pay Later",
  "SME Lending",
  "Open Banking",
  "Payroll & Benefits Software",
  "Vertical SaaS for SMBs",
  "Customer Support Automation",
  "Sales Intelligence",
  "Identity & Access Management",
  "Cloud Security",
  "Fraud Detection",
  "Telemedicine",
  "Clinical Workflow Software",
  "Pharmacy & Diagnostics",
  "Precision Agriculture",
  "Farm Management Software",
  "Livestock Technology",
  "Agri Commodities Trading",
  "Carbon Accounting",
  "Solar Developers",
  "Battery Technology",
  "Freight Marketplaces",
  "Fleet Management",
  "Quick Commerce",
  "Social Commerce",
  "B2B E-commerce",
  "Construction Management Software",
  "Rental Marketplaces",
  "Online Learning Platforms",
  "Upskilling & Bootcamps",
  "Talent Marketplaces",
  "Industrial Robotics",
  "Drones",
  "Mining Technology",
  "Creator Tools",
  "Mobile Gaming",
  "Legal Tech",
  "GovTech",
];

export const ECOSYSTEMS: { name: string; verticals: string[] }[] = [
  {
    name: "Stablecoins and Payments",
    verticals: [
      "Stablecoins & Digital Assets",
      "Cross-border Payments & Remittances",
      "Banking and Payment Infrastructure APIs",
      "Embedded Finance",
    ],
  },
  {
    name: "AI Application Layer",
    verticals: ["AI Agents and Process Copilots", "Customer Support Automation", "Sales Intelligence"],
  },
  {
    name: "AI Infrastructure Stack",
    verticals: ["Vector Databases & AI Data Stacks", "LLM Ops & Evaluation", "Observability & Monitoring"],
  },
  {
    name: "Agri-Food Value Chain",
    verticals: ["Precision Agriculture", "Farm Management Software", "Livestock Technology", "Agri Commodities Trading"],
  },
  { name: "SMB Operating Stack", verticals: ["Vertical SaaS for SMBs", "Payroll & Benefits Software", "SME Lending"] },
  { name: "Climate Transition", verticals: ["Carbon Accounting", "Solar Developers", "Battery Technology"] },
  { name: "Digital Commerce LatAm", verticals: ["Quick Commerce", "Social Commerce", "B2B E-commerce", "Buy Now Pay Later"] },
];

export const BUSINESS_MODELS = [
  "SaaS",
  "Marketplace",
  "Product Sales",
  "Subscription",
  "Licensing",
  "Transaction Fees",
  "Advertising",
  "Services",
  "Hardware",
] as const;

export const CUSTOMER_FOCUS = ["B2B", "B2C", "B2B2C", "B2G"] as const;
export const GROWTH_STAGES = ["Pre-seed / Seed", "Early", "Growth", "Late", "Exit / Public"] as const;
export const OPERATING_STATUSES = ["Active", "Acquired", "Closed", "IPO"] as const;
export const ROUND_TYPES = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series E",
  "Growth",
  "Debt",
  "Grant",
] as const;
export const INVESTOR_TYPES = ["VC", "PE", "CVC", "Angel", "Family office", "Accelerator", "Strategic"] as const;
export const SENIORITIES = ["Founder", "C-Level", "VP", "Director", "Manager", "Senior IC", "IC", "Intern"] as const;
export const DEPARTMENTS = ["Engineering", "Sales", "Product", "Operations", "Marketing", "Finance", "Design", "People"] as const;
export const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001+"] as const;
export const TALENT_SIGNAL_TYPES = [
  "NEW_COMPANY",
  "NEW_ROLE",
  "PROMOTION",
  "SEARCHING",
  "OUT_OF_STEALTH",
  "DEPARTURE",
] as const;

export const COMPANY_HIGHLIGHTS = [
  "headcount_surge",
  "strong_headcount_growth",
  "strong_web_traffic_growth",
  "strong_social_growth",
  "top_tier_investors",
  "no_recent_funding",
  "recently_funded",
  "accelerator_backed",
] as const;

export const PEOPLE_HIGHLIGHTS = [
  "Serial Founder",
  "Prior Exit",
  "Prior IPO",
  "Major Tech Experience",
  "Fortune 500 Experience",
  "Hyper Connector",
  "Influencer",
  "Top University",
  "Stealth",
  "Repeat Co-founders",
] as const;

export const INVESTOR_HIGHLIGHTS = ["Tier-1", "Lead investor", "Active", "Unicorn backer", "High follow-on rate"] as const;

export const HIGHLIGHT_LABELS: Record<string, string> = {
  headcount_surge: "Headcount surge",
  strong_headcount_growth: "Strong headcount growth",
  strong_web_traffic_growth: "Strong web traffic growth",
  strong_social_growth: "Strong social growth",
  top_tier_investors: "Top-tier investors",
  no_recent_funding: "No recent funding",
  recently_funded: "Recently funded",
  accelerator_backed: "Accelerator backed",
};

/** Regions → countries → cities. LatAm-first coverage (Founders is based in Santa Cruz, Bolivia). */
export const GEOGRAPHY: { region: string; country: string; code: string; cities: string[]; weight: number }[] = [
  { region: "Latin America", country: "Bolivia", code: "BO", cities: ["Santa Cruz de la Sierra", "La Paz", "Cochabamba"], weight: 6 },
  { region: "Latin America", country: "Brazil", code: "BR", cities: ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Florianópolis", "Curitiba"], weight: 16 },
  { region: "Latin America", country: "Mexico", code: "MX", cities: ["Mexico City", "Monterrey", "Guadalajara"], weight: 11 },
  { region: "Latin America", country: "Colombia", code: "CO", cities: ["Bogotá", "Medellín", "Cali"], weight: 7 },
  { region: "Latin America", country: "Argentina", code: "AR", cities: ["Buenos Aires", "Córdoba", "Rosario"], weight: 7 },
  { region: "Latin America", country: "Chile", code: "CL", cities: ["Santiago", "Valparaíso"], weight: 6 },
  { region: "Latin America", country: "Peru", code: "PE", cities: ["Lima", "Arequipa"], weight: 4 },
  { region: "Latin America", country: "Uruguay", code: "UY", cities: ["Montevideo"], weight: 3 },
  { region: "Latin America", country: "Paraguay", code: "PY", cities: ["Asunción"], weight: 2 },
  { region: "Latin America", country: "Ecuador", code: "EC", cities: ["Quito", "Guayaquil"], weight: 2 },
  { region: "North America", country: "United States", code: "US", cities: ["San Francisco", "New York", "Miami", "Austin", "Boston", "Seattle"], weight: 18 },
  { region: "North America", country: "Canada", code: "CA", cities: ["Toronto", "Vancouver", "Montreal"], weight: 3 },
  { region: "Europe", country: "Spain", code: "ES", cities: ["Madrid", "Barcelona", "Valencia"], weight: 5 },
  { region: "Europe", country: "United Kingdom", code: "GB", cities: ["London", "Manchester"], weight: 5 },
  { region: "Europe", country: "Germany", code: "DE", cities: ["Berlin", "Munich"], weight: 3 },
  { region: "Europe", country: "Portugal", code: "PT", cities: ["Lisbon", "Porto"], weight: 2 },
];

export const COUNTRIES = GEOGRAPHY.map((g) => g.country);
export const REGIONS = [...new Set(GEOGRAPHY.map((g) => g.region))];

export function buildTaxonomy() {
  const sectors: TaxNode[] = [];
  const industries: TaxNode[] = [];
  for (const [sector, inds] of Object.entries(SECTOR_TREE)) {
    const sid = `sec_${slug(sector)}`;
    sectors.push({ id: sid, name: sector });
    for (const ind of inds) industries.push({ id: `ind_${slug(ind)}`, name: ind, parentId: sid });
  }
  const verticals: TaxNode[] = TECH_VERTICALS.map((v) => ({ id: `tv_${slug(v)}`, name: v }));
  const ecosystems: TaxNode[] = ECOSYSTEMS.map((e) => ({ id: `eco_${slug(e.name)}`, name: e.name }));
  return { sectors, industries, verticals, ecosystems };
}

export const TAXONOMY = buildTaxonomy();

const nameById = new Map<string, string>(
  [...TAXONOMY.sectors, ...TAXONOMY.industries, ...TAXONOMY.verticals, ...TAXONOMY.ecosystems].map((n) => [n.id, n.name]),
);

export function taxonomyName(id: string): string {
  return nameById.get(id) ?? id;
}

export function verticalId(name: string): string {
  return `tv_${slug(name)}`;
}

export function ecosystemVerticalIds(ecosystemId: string): string[] {
  const eco = ECOSYSTEMS.find((e) => `eco_${slug(e.name)}` === ecosystemId);
  return eco ? eco.verticals.map(verticalId) : [];
}

/** Verticals that plausibly belong to each sector — used by the seed generator. */
export const SECTOR_VERTICALS: Record<string, string[]> = {
  "Financial Services": [
    "Banking and Payment Infrastructure APIs",
    "Stablecoins & Digital Assets",
    "Cross-border Payments & Remittances",
    "Embedded Finance",
    "Buy Now Pay Later",
    "SME Lending",
    "Open Banking",
    "Fraud Detection",
  ],
  "Software & Internet": [
    "Build, Test, CI/CD and Release",
    "Observability & Monitoring",
    "Vertical SaaS for SMBs",
    "Customer Support Automation",
    "Sales Intelligence",
    "Identity & Access Management",
    "Cloud Security",
    "Payroll & Benefits Software",
    "Legal Tech",
    "GovTech",
  ],
  "Artificial Intelligence": [
    "AI Agents and Process Copilots",
    "Vector Databases & AI Data Stacks",
    "LLM Ops & Evaluation",
    "Customer Support Automation",
    "Sales Intelligence",
  ],
  "Health & Life Sciences": ["Telemedicine", "Clinical Workflow Software", "Pharmacy & Diagnostics"],
  "Commerce & Consumer": ["Quick Commerce", "Social Commerce", "B2B E-commerce", "Buy Now Pay Later", "Rental Marketplaces"],
  "Climate & Energy": ["Carbon Accounting", "Solar Developers", "Battery Technology"],
  "Agriculture & Food Systems": [
    "Precision Agriculture",
    "Farm Management Software",
    "Livestock Technology",
    "Agri Commodities Trading",
  ],
  "Mobility & Logistics": ["Freight Marketplaces", "Fleet Management", "Quick Commerce"],
  "Real Estate & Construction": ["Construction Management Software", "Rental Marketplaces"],
  "Education & Work": ["Online Learning Platforms", "Upskilling & Bootcamps", "Talent Marketplaces", "Payroll & Benefits Software"],
  "Industrials & Hardware": ["Industrial Robotics", "Drones", "Mining Technology", "Battery Technology"],
  "Media & Entertainment": ["Creator Tools", "Mobile Gaming", "Social Commerce"],
};

export const SECTOR_NAMES = Object.keys(SECTOR_TREE);
export const SECTOR_INDUSTRIES = SECTOR_TREE;
export { slug as taxonomySlug };
