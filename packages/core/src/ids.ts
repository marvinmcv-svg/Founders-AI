import { randomBytes } from "node:crypto";

export const ID_PREFIX = {
  company: "com",
  person: "per",
  investor: "inv",
  round: "trx",
  acquisition: "acq",
  ipo: "ipo",
  talentSignal: "sig",
  news: "nws",
  newsSignal: "nsg",
  list: "lst",
  search: "srh",
  apiKey: "key",
  org: "org",
  user: "usr",
  lead: "led",
  note: "not",
  ledger: "cle",
  event: "evt",
  disclosure: "rvd",
  status: "sts",
  notification: "ntf",
  school: "sch",
  experience: "exp",
  dsar: "dsr",
  run: "run",
  integration: "int",
  delivery: "dlv",
  change: "chg",
  newsRaw: "nwr",
  webhook: "whk",
  webhookDelivery: "whd",
  query: "qry",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

/** Public, stable, prefixed 24-hex id, e.g. `com_65f0c2a91b3e4d7f8a9b0c1d`. */
export function newId(kind: IdKind): string {
  return `${ID_PREFIX[kind]}_${randomBytes(12).toString("hex")}`;
}

export function idKind(id: string): IdKind | undefined {
  const prefix = id.split("_")[0];
  return (Object.keys(ID_PREFIX) as IdKind[]).find((k) => ID_PREFIX[k] === prefix);
}
