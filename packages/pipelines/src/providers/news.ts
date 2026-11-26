/**
 * News sources (plan 9.5 input). Real adapters (GDELT, licensed news APIs, press wires, RSS) implement
 * `NewsSource` and need a legal review per source (plan 9 header) — H5.
 *
 * `SyntheticNewsSource` writes original articles about companies in the seed universe in English,
 * Spanish and Portuguese, including syndicated near-duplicates, stories about companies we do not
 * track, and two-company deal stories. Every article carries a ground-truth label for evaluation.
 */
import type { Rng } from "@founders/core/random";
import type { NewsCategory } from "@founders/core/signals/news";
import { pg } from "../db";

export type RawArticle = {
  url: string;
  publisher: string;
  title: string;
  body: string;
  publishedAt: Date;
  label: { category: NewsCategory; companyIds: string[]; duplicateOfUrl: string | null } | null;
};

export interface NewsSource {
  readonly name: string;
  fetch(opts: { limit: number; today: Date }): Promise<RawArticle[]>;
}

type Co = { id: string; name: string; country: string | null; vertical: string | null; focus: string | null };

const PUBLISHERS = [
  "El Deber Economía", "Página Siete Negocios", "LatAm Tech Wire", "Andes Startup Journal", "Valor Startups", "Bloque Fintech",
  "Contxto Review", "Pulso Emprendedor", "Startups del Sur", "Global Venture Daily", "Seed Signal", "Deal Street Weekly",
];
const FUNDS = ["Condor Ventures", "Lapacho Capital", "Harbor Growth", "Sajama Partners", "Meridian Fund", "Ceibo VC"];
const ROUNDS = ["seed", "Series A", "Series B", "pre-seed"];
const UNTRACKED = ["Kintu Labs", "Paloma Freight", "Arroyo Health", "Yuyo Foods", "Bruma Analytics", "Tacu Energy", "Chasqui Pay"];

type Lang = "en" | "es" | "pt";
type Tpl = (c: Co, x: { amt: string; fund: string; round: string; n: string; city: string; other: string }) => { title: string; body: string };

const T: Record<Exclude<NewsCategory, "other"> | "other", Record<Lang, Tpl[]>> = {
  funding: {
    en: [
      (c, x) => ({ title: `${c.name} raises ${x.amt} ${x.round} round`, body: `${c.name} has raised ${x.amt} in a ${x.round} round led by ${x.fund}. The company, which works on ${c.vertical ?? "software"}, plans to grow its team in ${x.city}. ${c.name} said the funding will also support new product lines.` }),
      (c, x) => ({ title: `${x.fund} leads ${x.amt} investment in ${c.name}`, body: `${c.name} closed ${x.amt} of funding led by ${x.fund}. Founders said ${c.name} will use the capital to expand sales.` }),
    ],
    es: [
      (c, x) => ({ title: `${c.name} levanta ${x.amt} en una ronda ${x.round}`, body: `La startup ${c.name} recaudó ${x.amt} en una ronda liderada por ${x.fund}. ${c.name} usará la inversión para crecer en ${x.city}.` }),
    ],
    pt: [
      (c, x) => ({ title: `${c.name} capta ${x.amt} em rodada ${x.round}`, body: `A ${c.name} captou ${x.amt} em rodada liderada pela ${x.fund}. Com o investimento, a ${c.name} vai contratar em ${x.city}.` }),
    ],
  },
  revenue: {
    en: [
      (c, x) => ({ title: `${c.name} reaches ${x.amt} in annual recurring revenue`, body: `${c.name} said its ARR reached ${x.amt}, driven by ${c.focus === "B2C" ? "subscriptions" : "enterprise contracts"}. ${c.name} expects revenue to keep growing next year.` }),
    ],
    es: [
      (c, x) => ({ title: `Los ingresos de ${c.name} llegan a ${x.amt}`, body: `${c.name} informó ingresos anuales de ${x.amt}. La facturación de ${c.name} creció por nuevos clientes en ${x.city}.` }),
    ],
    pt: [
      (c, x) => ({ title: `Receita da ${c.name} chega a ${x.amt}`, body: `O faturamento anual da ${c.name} chegou a ${x.amt}. A ${c.name} atribui o crescimento a novos contratos.` }),
    ],
  },
  profitability: {
    en: [(c) => ({ title: `${c.name} turns profitable`, body: `${c.name} reached profitability this quarter after cutting costs. Executives at ${c.name} said margins improved across markets.` })],
    es: [(c) => ({ title: `${c.name} alcanza la rentabilidad`, body: `${c.name} llegó al punto de equilibrio y ya es rentable. ${c.name} atribuye el logro a una mejor retención.` })],
    pt: [(c) => ({ title: `${c.name} registra primeiro lucro`, body: `A ${c.name} teve lucro pela primeira vez. Segundo a ${c.name}, o resultado veio da redução de custos.` })],
  },
  traction: {
    en: [
      (c, x) => ({ title: `${c.name} passes ${x.n} ${c.focus === "B2C" ? "users" : "customers"}`, body: `${c.name} now serves ${x.n} ${c.focus === "B2C" ? "users" : "customers"} in ${c.country ?? "the region"}. ${c.name} grew mostly through referrals.` }),
      (c, x) => ({ title: `${c.name} expands to ${x.city}`, body: `${c.name} launched in ${x.city} this week, its third market. ${c.name} hired a local team.` }),
    ],
    es: [(c, x) => ({ title: `${c.name} supera los ${x.n} clientes`, body: `${c.name} alcanzó ${x.n} clientes en ${c.country ?? "la región"}. La empresa ${c.name} planea llegar a nuevos mercados.` })],
    pt: [(c, x) => ({ title: `${c.name} chega a ${x.n} clientes`, body: `A ${c.name} chegou a ${x.n} clientes e vai abrir operação em ${x.city}. A ${c.name} cresceu por indicação.` })],
  },
  deals: {
    en: [
      (c, x) => ({ title: `${x.other} acquires ${c.name}`, body: `${x.other} announced the acquisition of ${c.name}. Terms were not disclosed. ${c.name} will keep its brand.` }),
      (c, x) => ({ title: `${c.name} signs partnership with ${x.other}`, body: `${c.name} and ${x.other} signed a strategic partnership to integrate their products. ${c.name} customers get access first.` }),
    ],
    es: [(c, x) => ({ title: `${c.name} firma alianza estratégica con ${x.other}`, body: `${c.name} y ${x.other} firmaron una alianza. ${c.name} integrará sus servicios.` })],
    pt: [(c, x) => ({ title: `${x.other} adquire a ${c.name}`, body: `A ${x.other} anunciou a aquisição da ${c.name}. A ${c.name} manterá a marca.` })],
  },
  other: {
    en: [
      (c, x) => ({ title: `${c.name} opens an office in ${x.city}`, body: `${c.name} opened a new office in ${x.city} that will host a small team. ${c.name} did not share further plans.` }),
      (c) => ({ title: `${c.name} appoints a new head of marketing`, body: `${c.name} named a new head of marketing. The executive joins ${c.name} from a consumer brand.` }),
    ],
    es: [(c) => ({ title: `${c.name} presenta su nueva identidad de marca`, body: `${c.name} lanzó un nuevo logo y sitio web. ${c.name} dijo que el cambio refleja su crecimiento.` })],
    pt: [(c) => ({ title: `${c.name} recebe prêmio de inovação`, body: `A ${c.name} foi premiada em evento regional. A ${c.name} agradeceu a equipe.` })],
  },
};

const CITIES = ["Santa Cruz", "La Paz", "São Paulo", "Ciudad de México", "Bogotá", "Lima", "Santiago", "Buenos Aires", "Asunción", "Montevideo"];

function fmtAmount(rng: Rng, lang: Lang, usd: number): string {
  const m = usd / 1e6;
  if (lang === "pt" && rng.chance(0.5)) return `R$ ${(m / 0.19).toFixed(0)} milhões`;
  if (lang === "es") return `US$ ${m.toFixed(1).replace(".", ",")} millones`;
  if (lang === "pt") return `US$ ${m.toFixed(1).replace(".", ",")} milhões`;
  return `$${m.toFixed(1)}M`;
}

/** Light edits a syndication partner makes: different publisher, URL, a reworded sentence. */
function syndicate(rng: Rng, a: RawArticle, i: number): RawArticle {
  const publisher = rng.pick(PUBLISHERS.filter((p) => p !== a.publisher));
  const body = a.body.replace(/\. ([^.]+)\.$/, (_m, last: string) => `. ${last} (via ${a.publisher}).`);
  const publishedAt = new Date(a.publishedAt.getTime() + rng.int(1, 6) * 3_600_000);
  return { ...a, publisher, publishedAt, url: `${a.url}-syn${i}`, body, title: a.title, label: a.label ? { ...a.label, duplicateOfUrl: a.url } : null };
}

export class SyntheticNewsSource implements NewsSource {
  readonly name = "synthetic_news";
  constructor(private readonly rng: Rng) {}

  async fetch({ limit, today }: { limit: number; today: Date }): Promise<RawArticle[]> {
    const sql = pg();
    // Distinct names only, so the ground truth is unambiguous.
    const cos = await sql<Co[]>`SELECT id, name, country, vertical, focus FROM (
        SELECT c.id, c.name, c.hq_country AS country, t.name AS vertical, c.customer_focus AS focus, c.rank,
          count(*) OVER (PARTITION BY c.name) AS same_name
        FROM companies c LEFT JOIN taxonomy_nodes t ON t.id = c.tech_vertical_ids[1] WHERE c.deleted_at IS NULL) x
      WHERE same_name = 1 ORDER BY rank ASC NULLS LAST LIMIT ${Math.max(2000, limit * 4)}`;
    const out: RawArticle[] = [];
    const rng = this.rng;
    let i = 0;
    while (out.length < limit) {
      i++;
      // Power law over rank: better-ranked companies get more coverage.
      const c = cos[Math.floor(Math.pow(rng.next(), 1.7) * cos.length)] as Co;
      const category = rng.weighted<NewsCategory>(["funding", "traction", "revenue", "deals", "profitability", "other"], [26, 24, 14, 12, 8, 16]);
      const lang = rng.weighted<Lang>(["en", "es", "pt"], [50, 30, 20]);
      const untracked = rng.chance(0.08);
      const subject: Co = untracked ? { id: "", name: `${rng.pick(UNTRACKED)}`, country: null, vertical: null, focus: null } : c;
      const otherCo = category === "deals" && rng.chance(0.5) ? (cos[rng.int(0, cos.length - 1)] as Co) : null;
      const usd = category === "funding" ? rng.logRange(0.5e6, 60e6) : rng.logRange(0.4e6, 40e6);
      const x = {
        amt: fmtAmount(rng, lang, usd),
        fund: rng.pick(FUNDS),
        round: rng.pick(ROUNDS),
        n: rng.pick(["10,000", "25,000", "50,000", "120,000", "1 million"]),
        city: rng.pick(CITIES),
        other: otherCo?.name ?? rng.pick(["Andes Telecom Group", "Rio Payments S.A.", "Cordillera Bank", "Globex Cloud"]),
      };
      const tpl = rng.pick(T[category][lang]);
      const { title, body } = tpl(subject, x);
      const publishedAt = new Date(today.getTime() - rng.int(0, 36) * 3_600_000);
      const companyIds = [subject.id, ...(otherCo && otherCo.id !== subject.id ? [otherCo.id] : [])].filter(Boolean);
      const url = `https://example.com/news/${today.toISOString().slice(0, 10)}/${rng.hex(10)}`;
      const art: RawArticle = { url, publisher: rng.pick(PUBLISHERS), title, body, publishedAt, label: { category, companyIds, duplicateOfUrl: null } };
      out.push(art);
      if (rng.chance(0.15) && out.length < limit) out.push(syndicate(rng, art, i));
    }
    return out;
  }
}
