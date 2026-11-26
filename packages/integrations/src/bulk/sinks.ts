/**
 * Bulk delivery sinks (plan 13.5): S3 (SigV4), GCS (S3-interoperable XML API with HMAC keys), and
 * Snowflake (stage files to S3/GCS, then COPY INTO through the SQL API with key-pair JWT auth).
 * Requests go through an injected transport; the app passes the egress proxy pinned to the sink host.
 */
import { createHash, createHmac, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type SinkRequest = { method: "PUT" | "POST" | "GET"; url: string; headers: Record<string, string>; body?: Uint8Array | string };
export type SinkTransport = (req: SinkRequest) => Promise<{ status: number; body: string }>;

export interface Sink {
  readonly kind: "S3" | "GCS" | "SNOWFLAKE" | "LOCAL" | "MEMORY";
  /** Where a key ends up, for the manifest (s3://bucket/prefix/key, gs://…, file://…). */
  uri(key: string): string;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Called once all files of a run are written (Snowflake loads them). */
  finish?(files: DeliveredFile[]): Promise<{ statements: string[] }>;
}

export type DeliveredFile = { dataset: string; kind: "FULL" | "INCREMENTAL"; key: string; uri: string; rows: number; bytes: number; sha256: string; format: "CSV" | "PARQUET" };

export class MemorySink implements Sink {
  readonly kind = "MEMORY" as const;
  readonly files = new Map<string, Uint8Array>();
  uri(key: string) {
    return `memory://${key}`;
  }
  async put(key: string, body: Uint8Array) {
    this.files.set(key, body);
  }
}

/** Development sink: a local directory (only allowed when BULK_LOCAL_DIR is set; never in production). */
export function localSink(dir: string): Sink {
  const root = path.resolve(dir);
  return {
    kind: "LOCAL",
    uri: (key) => `file://${path.join(root, key)}`,
    async put(key, body) {
      const target = path.resolve(root, key);
      if (!target.startsWith(root + path.sep)) throw new Error("Key escapes the delivery directory");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },
  };
}

/* ---------------- S3 / GCS (SigV4) ---------------- */

export type S3Config = {
  bucket: string;
  region: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Custom endpoint host (GCS: storage.googleapis.com). Default s3.<region>.amazonaws.com. */
  endpoint?: string;
};

const sha256hex = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const hmac = (key: Uint8Array | string, data: string) => createHmac("sha256", key).update(data).digest();
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** AWS Signature Version 4 for a single path-style request (also accepted by GCS interoperability). */
export function sigV4(input: { method: string; host: string; path: string; query?: string; region: string; service: string; accessKeyId: string; secretAccessKey: string; body: Uint8Array | string; headers?: Record<string, string>; now?: Date; contentSha256Header?: boolean }) {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256hex(input.body);
  const headers: Record<string, string> = { ...(input.headers ?? {}), host: input.host, ...(input.contentSha256Header === false ? {} : { "x-amz-content-sha256": payloadHash }), "x-amz-date": amzDate };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonical = [input.method, input.path, input.query ?? "", names.map((n) => `${n}:${lower[n]}`).join("\n") + "\n", names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  return {
    ...Object.fromEntries(Object.entries(headers).filter(([k]) => k !== "host")),
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export function s3Host(c: S3Config) {
  return c.endpoint ?? `s3.${c.region}.amazonaws.com`;
}

export function s3Sink(c: S3Config, transport: SinkTransport, kind: "S3" | "GCS" = "S3"): Sink & { kind: "S3" | "GCS" } {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.bucket)) throw new Error("Invalid bucket name");
  const host = s3Host(c);
  const prefix = (c.prefix ?? "").replace(/^\/+|\/+$/g, "");
  const keyOf = (key: string) => (prefix ? `${prefix}/${key}` : key);
  return {
    kind,
    uri: (key) => `${kind === "GCS" ? "gs" : "s3"}://${c.bucket}/${keyOf(key)}`,
    async put(key, body, contentType) {
      const path = `/${c.bucket}/${keyOf(key).split("/").map(rfc3986).join("/")}`;
      const headers = sigV4({ method: "PUT", host, path, region: c.region, service: "s3", accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, body, headers: { "content-type": contentType } });
      const r = await transport({ method: "PUT", url: `https://${host}${path}`, headers, body });
      if (r.status === 403) throw new Error(`${kind} denied the upload — check the bucket policy / keys`);
      if (r.status >= 300) throw new Error(`${kind} upload failed (${r.status})`);
    },
  };
}

/* ---------------- Snowflake (stage + COPY INTO via the SQL API) ---------------- */

export type SnowflakeConfig = {
  /** Account locator, e.g. "xy12345.us-east-1" (host = <account>.snowflakecomputing.com). */
  account: string;
  user: string;
  /** PKCS#8 PEM private key registered on the user (RSA_PUBLIC_KEY). */
  privateKeyPem: string;
  warehouse: string;
  database: string;
  schema: string;
  /** External stage that points at the S3 / GCS location files are written to. */
  stage: string;
  role?: string;
};

const ident = (s: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_$]{0,254}$/.test(s)) throw new Error(`Invalid Snowflake identifier: ${s}`);
  return s.toUpperCase();
};

/** Key-pair JWT for the Snowflake SQL API (RS256; iss carries the public-key fingerprint). */
export function snowflakeJwt(c: Pick<SnowflakeConfig, "account" | "user" | "privateKeyPem">, now = Math.floor(Date.now() / 1000)): string {
  const account = c.account.split(".")[0]!.toUpperCase();
  const user = c.user.toUpperCase();
  const key = createPrivateKey(c.privateKeyPem);
  const der = createPublicKey(key).export({ type: "spki", format: "der" });
  const fp = `SHA256:${createHash("sha256").update(der).digest("base64")}`;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: `${account}.${user}.${fp}`, sub: `${account}.${user}`, iat: now, exp: now + 3540 })}`;
  return `${head}.${sign("sha256", Buffer.from(head), key).toString("base64url")}`;
}

/** COPY statements for a run: full snapshots replace the table; incrementals append to `<table>_CHANGES`. */
export function snowflakeStatements(c: SnowflakeConfig, files: DeliveredFile[], stageKey: (key: string) => string): string[] {
  const fq = (t: string) => `${ident(c.database)}.${ident(c.schema)}.${ident(t)}`;
  const stage = `${ident(c.database)}.${ident(c.schema)}.${ident(c.stage)}`;
  const pq = fq("FOUNDERS_PARQUET");
  const csv = fq("FOUNDERS_CSV");
  const out: string[] = [`CREATE FILE FORMAT IF NOT EXISTS ${pq} TYPE = PARQUET`, `CREATE FILE FORMAT IF NOT EXISTS ${csv} TYPE = CSV PARSE_HEADER = TRUE FIELD_OPTIONALLY_ENCLOSED_BY = '"'`];
  for (const f of files) {
    const fmt = f.format === "PARQUET" ? pq : csv;
    const loc = `@${stage}/${stageKey(f.key)}`;
    const table = f.kind === "FULL" ? fq(f.dataset) : fq(`${f.dataset}_changes`);
    out.push(`CREATE TABLE IF NOT EXISTS ${table} USING TEMPLATE (SELECT ARRAY_AGG(OBJECT_CONSTRUCT(*)) FROM TABLE(INFER_SCHEMA(LOCATION => '${loc}', FILE_FORMAT => '${fmt}')))`);
    if (f.kind === "FULL") out.push(`TRUNCATE TABLE ${table}`);
    out.push(`COPY INTO ${table} FROM ${loc} FILE_FORMAT = (FORMAT_NAME = '${fmt}') MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE`);
  }
  return out;
}

export function snowflakeSink(c: SnowflakeConfig, stage: Sink & { kind: "S3" | "GCS" }, transport: SinkTransport, stagePrefix = ""): Sink {
  const host = `${c.account.toLowerCase()}.snowflakecomputing.com`;
  const stageKey = (key: string) => (stagePrefix ? `${stagePrefix.replace(/\/+$/, "")}/${key}` : key);
  return {
    kind: "SNOWFLAKE",
    uri: (key) => stage.uri(key),
    put: (key, body, ct) => stage.put(key, body, ct),
    async finish(files) {
      const statements = snowflakeStatements(c, files, stageKey);
      const jwt = snowflakeJwt(c);
      for (const statement of statements) {
        const r = await transport({
          method: "POST",
          url: `https://${host}/api/v2/statements`,
          headers: { authorization: `Bearer ${jwt}`, "x-snowflake-authorization-token-type": "KEYPAIR_JWT", "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ statement, timeout: 600, warehouse: ident(c.warehouse), database: ident(c.database), schema: ident(c.schema), ...(c.role ? { role: ident(c.role) } : {}) }),
        });
        if (r.status >= 300) throw new Error(`Snowflake rejected a statement (${r.status}): ${r.body.slice(0, 200)}`);
      }
      return { statements };
    },
  };
}

export const SINK_HOSTS = {
  s3: (c: S3Config) => [s3Host(c)],
  snowflake: (c: Pick<SnowflakeConfig, "account">) => [`${c.account.toLowerCase()}.snowflakecomputing.com`],
};
