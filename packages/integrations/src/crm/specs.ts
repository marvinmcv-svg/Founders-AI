/**
 * Provider specs: native object names, record shapes and default field maps for the six CRMs in
 * plan 13.1. Shapes follow each vendor's public REST API (field names, nesting); custom fields we
 * create on their side are prefixed `founders_` / `Founders_…__c` so they never collide.
 */
import {
  blankRecord,
  first,
  normDomain,
  normLinkedin,
  obj,
  str,
  type CrmKind,
  type CrmProvider,
  type CrmRecord,
  type Native,
  type ProviderSpec,
  type PushKind,
  type PushValue,
} from "./types";

const keyFor = (kind: PushKind, raw: unknown) => (kind === "COMPANY" ? normDomain(raw) : normLinkedin(raw));
const join = (a: unknown, b: unknown) => [str(a), str(b)].filter(Boolean).join(" ") || null;

/* ------------------------------------------------------------------ */
/* HubSpot — CRM v3 objects: { id, properties: {...}, updatedAt }      */
/* ------------------------------------------------------------------ */
const hubspot: ProviderSpec = {
  provider: "HUBSPOT",
  label: "HubSpot",
  auth: ["OAUTH", "TOKEN"],
  objects: { COMPANY: "companies", PERSON: "contacts", DEAL: "deals" },
  keyField: { COMPANY: "domain", PERSON: "hs_linkedin_url" },
  defaultFieldMap: {
    COMPANY: {
      name: "name",
      domain: "domain",
      tagline: "description",
      hq: "city",
      employee_count: "numberofemployees",
      est_revenue_usd: "annualrevenue",
      total_funding_usd: "total_money_raised",
      growth_stage: "founders_stage",
      last_funding_date: "founders_last_funding_date",
      rank: "founders_rank",
      profile_url: "founders_profile_url",
    },
    PERSON: {
      first: "firstname",
      last: "lastname",
      linkedin_url: "hs_linkedin_url",
      title: "jobtitle",
      company_name: "company",
      location: "city",
      profile_url: "founders_profile_url",
    },
  },
  idOf: (n) => String(n.id),
  fromNative(kind, n) {
    const p = obj(n.properties);
    const r = blankRecord(kind, String(n.id), n);
    r.owner = str(p.hubspot_owner_id);
    r.lastActivity = str(p.notes_last_updated) ?? str(n.updatedAt);
    if (kind === "COMPANY") {
      r.name = str(p.name);
      r.domain = normDomain(p.domain);
      r.stage = str(p.lifecyclestage);
    } else if (kind === "PERSON") {
      r.name = join(p.firstname, p.lastname);
      r.email = str(p.email);
      r.linkedinUrl = normLinkedin(p.hs_linkedin_url);
      r.stage = str(p.lifecyclestage);
      r.companyExternalId = str(p.associatedcompanyid);
    } else {
      r.name = str(p.dealname);
      r.stage = str(p.dealstage);
      r.companyExternalId = str(p.associatedcompanyid);
      r.open = str(p.hs_is_closed) !== "true";
    }
    return r;
  },
  toNative: (_k, fields, owner) => ({ properties: { ...fields, ...(owner ? { hubspot_owner_id: owner } : {}) } }),
  keyOf: (k, n) => keyFor(k, obj(n.properties)[hubspot.keyField[k]]),
};

/* ------------------------------------------------------------------ */
/* Salesforce — sObjects: Account / Contact / Opportunity (flat)        */
/* ------------------------------------------------------------------ */
const salesforce: ProviderSpec = {
  provider: "SALESFORCE",
  label: "Salesforce",
  auth: ["OAUTH"],
  objects: { COMPANY: "Account", PERSON: "Contact", DEAL: "Opportunity" },
  keyField: { COMPANY: "Website", PERSON: "Founders_LinkedIn__c" },
  defaultFieldMap: {
    COMPANY: {
      name: "Name",
      domain: "Website",
      tagline: "Description",
      hq: "BillingCity",
      employee_count: "NumberOfEmployees",
      est_revenue_usd: "AnnualRevenue",
      total_funding_usd: "Founders_Total_Funding__c",
      growth_stage: "Founders_Stage__c",
      last_funding_date: "Founders_Last_Funding_Date__c",
      rank: "Founders_Rank__c",
      profile_url: "Founders_Profile_URL__c",
    },
    PERSON: {
      first: "FirstName",
      last: "LastName",
      linkedin_url: "Founders_LinkedIn__c",
      title: "Title",
      company_name: "Founders_Company__c",
      location: "MailingCity",
      profile_url: "Founders_Profile_URL__c",
    },
  },
  idOf: (n) => String(n.Id),
  fromNative(kind, n) {
    const r = blankRecord(kind, String(n.Id), n);
    r.owner = str(obj(n.Owner).Name) ?? str(n.OwnerId);
    r.lastActivity = str(n.LastActivityDate) ?? str(n.LastModifiedDate);
    if (kind === "COMPANY") {
      r.name = str(n.Name);
      r.domain = normDomain(n.Website);
      r.stage = str(n.Type);
    } else if (kind === "PERSON") {
      r.name = join(n.FirstName, n.LastName);
      r.email = str(n.Email);
      r.linkedinUrl = normLinkedin(n.Founders_LinkedIn__c);
      r.companyExternalId = str(n.AccountId);
    } else {
      r.name = str(n.Name);
      r.stage = str(n.StageName);
      r.companyExternalId = str(n.AccountId);
      r.open = n.IsClosed !== true;
    }
    return r;
  },
  toNative: (_k, fields, owner) => ({ ...fields, ...(owner ? { OwnerId: owner } : {}) }),
  keyOf: (k, n) => keyFor(k, n[salesforce.keyField[k]]),
};

/* ------------------------------------------------------------------ */
/* Attio — v2 records: { id: { record_id }, values: { attr: [{...}] } } */
/* ------------------------------------------------------------------ */
const attioValue = (values: Native, attr: string): unknown => {
  const v = obj(first(values[attr]));
  return v.value ?? v.domain ?? v.full_name ?? v.email_address ?? v.status ?? v.target_record_id ?? v.referenced_actor_id ?? null;
};
const attio: ProviderSpec = {
  provider: "ATTIO",
  label: "Attio",
  auth: ["OAUTH", "TOKEN"],
  objects: { COMPANY: "companies", PERSON: "people", DEAL: "deals" },
  keyField: { COMPANY: "domains", PERSON: "linkedin" },
  defaultFieldMap: {
    COMPANY: {
      name: "name",
      domain: "domains",
      tagline: "description",
      hq: "primary_location",
      employee_count: "founders_employee_count",
      est_revenue_usd: "founders_est_revenue",
      total_funding_usd: "founders_total_funding",
      growth_stage: "founders_stage",
      last_funding_date: "founders_last_funding_date",
      rank: "founders_rank",
      profile_url: "founders_profile_url",
    },
    PERSON: {
      first: "first_name",
      last: "last_name",
      linkedin_url: "linkedin",
      title: "job_title",
      company_name: "founders_company",
      location: "primary_location",
      profile_url: "founders_profile_url",
    },
  },
  idOf: (n) => String(obj(n.id).record_id),
  fromNative(kind, n) {
    const v = obj(n.values);
    const r = blankRecord(kind, attio.idOf(n), n);
    r.owner = str(attioValue(v, "owner"));
    r.lastActivity = str(attioValue(v, "last_interaction")) ?? str(n.created_at);
    if (kind === "COMPANY") {
      r.name = str(attioValue(v, "name"));
      r.domain = normDomain(attioValue(v, "domains"));
      r.stage = str(attioValue(v, "stage"));
    } else if (kind === "PERSON") {
      r.name = str(attioValue(v, "name")) ?? join(attioValue(v, "first_name"), attioValue(v, "last_name"));
      r.email = str(attioValue(v, "email_addresses"));
      r.linkedinUrl = normLinkedin(attioValue(v, "linkedin"));
      r.companyExternalId = str(attioValue(v, "company"));
    } else {
      r.name = str(attioValue(v, "name"));
      r.stage = str(attioValue(v, "stage"));
      r.companyExternalId = str(attioValue(v, "associated_company"));
      r.open = !/^(won|lost)$/i.test(r.stage ?? "");
    }
    return r;
  },
  toNative(_k, fields, owner) {
    const values: Native = {};
    for (const [attr, val] of Object.entries(fields)) {
      if (val === null) continue;
      values[attr] = attr === "domains" ? [{ domain: val }] : [{ value: val }];
    }
    if (owner) values.owner = [{ referenced_actor_type: "workspace-member", referenced_actor_id: owner }];
    return { values };
  },
  keyOf: (k, n) => keyFor(k, attioValue(obj(n.values), attio.keyField[k])),
};

/* ------------------------------------------------------------------ */
/* Affinity — organizations / persons / opportunities (flat + fields)   */
/* ------------------------------------------------------------------ */
const affinity: ProviderSpec = {
  provider: "AFFINITY",
  label: "Affinity",
  auth: ["TOKEN"],
  objects: { COMPANY: "organizations", PERSON: "persons", DEAL: "opportunities" },
  keyField: { COMPANY: "domain", PERSON: "linkedin_url" },
  defaultFieldMap: {
    COMPANY: {
      name: "name",
      domain: "domain",
      tagline: "Description",
      hq: "Location",
      employee_count: "Employees",
      est_revenue_usd: "Est. Revenue",
      total_funding_usd: "Total Funding",
      growth_stage: "Stage",
      last_funding_date: "Last Funding Date",
      rank: "Founders Rank",
      profile_url: "Founders Profile",
    },
    PERSON: {
      first: "first_name",
      last: "last_name",
      linkedin_url: "linkedin_url",
      title: "Job Title",
      company_name: "Current Organization",
      location: "Location",
      profile_url: "Founders Profile",
    },
  },
  idOf: (n) => String(n.id),
  fromNative(kind, n) {
    const f = obj(n.fields);
    const r = blankRecord(kind, String(n.id), n);
    r.owner = str(f.Owner);
    r.lastActivity = str(obj(n.interaction_dates).last_interaction_date);
    if (kind === "COMPANY") {
      r.name = str(n.name);
      r.domain = normDomain(n.domain ?? first(n.domains));
      r.stage = str(f.Status);
    } else if (kind === "PERSON") {
      r.name = join(n.first_name, n.last_name);
      r.email = str(n.primary_email);
      r.linkedinUrl = normLinkedin(n.linkedin_url ?? f["LinkedIn URL"]);
      r.companyExternalId = str(first(n.organization_ids));
    } else {
      r.name = str(n.name);
      r.stage = str(f.Status);
      r.companyExternalId = str(first(n.organization_ids));
      r.open = !/^(closed|won|lost|passed)/i.test(r.stage ?? "");
    }
    return r;
  },
  toNative(_k, fields, owner) {
    const top = new Set(["name", "domain", "first_name", "last_name", "linkedin_url"]);
    const native: Native = { fields: {} as Native };
    for (const [k, v] of Object.entries(fields)) {
      if (top.has(k)) native[k] = v;
      else (native.fields as Native)[k] = v;
    }
    if (owner) (native.fields as Native).Owner = owner;
    return native;
  },
  keyOf: (k, n) => keyFor(k, n[affinity.keyField[k]] ?? (k === "COMPANY" ? first(n.domains) : obj(n.fields)["LinkedIn URL"])),
};

/* ------------------------------------------------------------------ */
/* Pipedrive — v1 organizations / persons / deals                       */
/* ------------------------------------------------------------------ */
const pipedrive: ProviderSpec = {
  provider: "PIPEDRIVE",
  label: "Pipedrive",
  auth: ["OAUTH", "TOKEN"],
  objects: { COMPANY: "organizations", PERSON: "persons", DEAL: "deals" },
  keyField: { COMPANY: "website", PERSON: "linkedin" },
  defaultFieldMap: {
    COMPANY: {
      name: "name",
      domain: "website",
      tagline: "founders_description",
      hq: "address",
      employee_count: "people_count",
      est_revenue_usd: "founders_est_revenue",
      total_funding_usd: "founders_total_funding",
      growth_stage: "founders_stage",
      last_funding_date: "founders_last_funding_date",
      rank: "founders_rank",
      profile_url: "founders_profile_url",
    },
    PERSON: {
      first: "first_name",
      last: "last_name",
      linkedin_url: "linkedin",
      title: "job_title",
      company_name: "founders_company",
      location: "postal_address",
      profile_url: "founders_profile_url",
    },
  },
  idOf: (n) => String(n.id),
  fromNative(kind, n) {
    const r = blankRecord(kind, String(n.id), n);
    r.owner = str(obj(n.owner_id).name) ?? str(n.owner_id);
    r.lastActivity = str(n.last_activity_date) ?? str(n.update_time);
    if (kind === "COMPANY") {
      r.name = str(n.name);
      r.domain = normDomain(n.website);
      r.stage = str(n.label);
    } else if (kind === "PERSON") {
      r.name = str(n.name) ?? join(n.first_name, n.last_name);
      r.email = str(obj(first(n.email)).value);
      r.linkedinUrl = normLinkedin(n.linkedin);
      r.companyExternalId = str(obj(n.org_id).value ?? n.org_id);
    } else {
      r.name = str(n.title);
      r.stage = str(n.stage_name) ?? str(n.stage_id);
      r.companyExternalId = str(obj(n.org_id).value ?? n.org_id);
      r.open = (str(n.status) ?? "open") === "open";
    }
    return r;
  },
  toNative: (_k, fields, owner) => ({ ...fields, ...(owner ? { owner_id: Number(owner) || owner } : {}) }),
  keyOf: (k, n) => keyFor(k, n[pipedrive.keyField[k]]),
};

/* ------------------------------------------------------------------ */
/* Airtable — base tables: { id, createdTime, fields: {...} }           */
/* ------------------------------------------------------------------ */
const airtable: ProviderSpec = {
  provider: "AIRTABLE",
  label: "Airtable",
  auth: ["OAUTH", "TOKEN"],
  objects: { COMPANY: "Companies", PERSON: "People", DEAL: "Deals" },
  keyField: { COMPANY: "Website", PERSON: "LinkedIn" },
  defaultFieldMap: {
    COMPANY: {
      name: "Name",
      domain: "Website",
      tagline: "Description",
      hq: "HQ",
      employee_count: "Employees",
      est_revenue_usd: "Est. Revenue (USD)",
      total_funding_usd: "Total Funding (USD)",
      growth_stage: "Stage",
      last_funding_date: "Last Funding Date",
      rank: "Founders Rank",
      profile_url: "Founders Profile",
    },
    PERSON: {
      first: "First Name",
      last: "Last Name",
      linkedin_url: "LinkedIn",
      title: "Title",
      company_name: "Company",
      location: "Location",
      profile_url: "Founders Profile",
    },
  },
  idOf: (n) => String(n.id),
  fromNative(kind, n) {
    const f = obj(n.fields);
    const r = blankRecord(kind, String(n.id), n);
    r.owner = str(obj(f.Owner).name) ?? str(f.Owner);
    r.lastActivity = str(f["Last Activity"]) ?? str(n.createdTime);
    if (kind === "COMPANY") {
      r.name = str(f.Name);
      r.domain = normDomain(f.Website);
      r.stage = str(f.Status);
    } else if (kind === "PERSON") {
      r.name = str(f.Name) ?? join(f["First Name"], f["Last Name"]);
      r.email = str(f.Email);
      r.linkedinUrl = normLinkedin(f.LinkedIn);
      r.companyExternalId = str(first(f["Company Record"]));
    } else {
      r.name = str(f.Name);
      r.stage = str(f.Stage);
      r.companyExternalId = str(first(f.Company));
      r.open = !/^(won|lost|closed)/i.test(r.stage ?? "");
    }
    return r;
  },
  toNative: (_k, fields, owner) => ({ fields: { ...fields, ...(owner ? { Owner: owner } : {}) } }),
  keyOf: (k, n) => keyFor(k, obj(n.fields)[airtable.keyField[k]]),
};

export const SPECS: Record<CrmProvider, ProviderSpec> = {
  ATTIO: attio,
  AFFINITY: affinity,
  SALESFORCE: salesforce,
  HUBSPOT: hubspot,
  PIPEDRIVE: pipedrive,
  AIRTABLE: airtable,
};

export const KIND_LABEL: Record<CrmKind, string> = { COMPANY: "Companies", PERSON: "People", DEAL: "Deals" };

/** Helper used by tests and seeding: build a native record from a normalised one. */
export function nativeFromRecord(spec: ProviderSpec, kind: PushKind, r: Pick<CrmRecord, "name" | "domain" | "linkedinUrl">): Native {
  const map = spec.defaultFieldMap[kind];
  const fields: Record<string, PushValue> = {};
  if (kind === "COMPANY") {
    if (r.name && map.name) fields[map.name] = r.name;
    if (r.domain && map.domain) fields[map.domain] = r.domain;
  } else {
    const [fn, ...rest] = (r.name ?? "").split(" ");
    if (map.first) fields[map.first] = fn ?? null;
    if (map.last) fields[map.last] = rest.join(" ") || null;
    if (r.linkedinUrl && map.linkedin_url) fields[map.linkedin_url] = `https://www.${r.linkedinUrl}`;
  }
  return spec.toNative(kind, fields, null);
}

export type { CrmKind };
