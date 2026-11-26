import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeDataset, localSink, readParquet, s3Sink, sigV4, snowflakeJwt, snowflakeSink, snowflakeStatements, writeParquet, type SinkRequest } from "../src/bulk";

describe("parquet", () => {
  const columns = [
    { name: "id", type: "string" as const },
    { name: "op", type: "string" as const },
    { name: "employees", type: "int" as const },
    { name: "growth", type: "double" as const },
    { name: "bootstrapped", type: "bool" as const },
    { name: "highlights", type: "string" as const },
  ];

  it("round-trips nulls, unicode, negatives, booleans and JSON columns", () => {
    const rows = [
      { id: "com_1", op: "upsert", employees: 42, growth: 0.125, bootstrapped: true, highlights: ["a", "b"] },
      { id: "com_2", op: "upsert", employees: null, growth: -1.5, bootstrapped: false, highlights: null },
      { id: "com_3", op: "delete", employees: -7, growth: null, bootstrapped: null, highlights: "Ñandú, \"quoted\"" },
    ];
    const file = writeParquet(columns, rows, { dataset: "companies" });
    expect(new TextDecoder().decode(file.slice(0, 4))).toBe("PAR1");
    expect(new TextDecoder().decode(file.slice(-4))).toBe("PAR1");
    const back = readParquet(file);
    expect(back.columns).toEqual(columns);
    expect(back.meta).toEqual({ dataset: "companies" });
    expect(back.rows).toEqual([
      { id: "com_1", op: "upsert", employees: 42, growth: 0.125, bootstrapped: true, highlights: '["a","b"]' },
      { id: "com_2", op: "upsert", employees: null, growth: -1.5, bootstrapped: false, highlights: null },
      { id: "com_3", op: "delete", employees: -7, growth: null, bootstrapped: null, highlights: 'Ñandú, "quoted"' },
    ]);
  });

  it("handles larger files and many columns (long lists, long runs)", () => {
    const cols = Array.from({ length: 20 }, (_, i) => ({ name: `c${i}`, type: (i % 2 ? "int" : "string") as "int" | "string" }));
    const rows = Array.from({ length: 5000 }, (_, r) => Object.fromEntries(cols.map((c, i) => [c.name, r % 7 === 0 ? null : c.type === "int" ? r * i : `v${r}-${i}`])));
    const back = readParquet(writeParquet(cols, rows));
    expect(back.rows).toHaveLength(5000);
    expect(back.rows[4999]).toEqual(rows[4999]);
    expect(back.rows[7]?.c3).toBeNull();
  });

  it("CSV output guards formula injection and keeps JSON columns", () => {
    const { body, ext } = encodeDataset("CSV", columns, [{ id: "=cmd()", op: "upsert", employees: 1, growth: 0, bootstrapped: true, highlights: ["x"] }]);
    expect(ext).toBe("csv");
    expect(new TextDecoder().decode(body)).toBe('id,op,employees,growth,bootstrapped,highlights\n\'=cmd(),upsert,1,0,true,"[""x""]"\n');
  });
});

describe("sinks", () => {
  it("SigV4 matches the AWS published test vector (get-vanilla)", () => {
    const h = sigV4({
      method: "GET",
      host: "example.amazonaws.com",
      path: "/",
      region: "us-east-1",
      service: "service",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      body: "",
      now: new Date("2015-08-30T12:36:00Z"),
      contentSha256Header: false,
    });
    expect(h.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("S3 / GCS sinks PUT path-style, signed, to the right host", async () => {
    const calls: SinkRequest[] = [];
    const t = async (r: SinkRequest) => (calls.push(r), { status: 200, body: "" });
    const s3 = s3Sink({ bucket: "acme-data", region: "eu-west-1", prefix: "founders/", accessKeyId: "AK", secretAccessKey: "SK" }, t);
    await s3.put("companies/companies_2026-11-26.parquet", new Uint8Array([1, 2, 3]), "application/vnd.apache.parquet");
    expect(calls[0]?.url).toBe("https://s3.eu-west-1.amazonaws.com/acme-data/founders/companies/companies_2026-11-26.parquet");
    expect(calls[0]?.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/eu-west-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(s3.uri("a.parquet")).toBe("s3://acme-data/founders/a.parquet");
    const gcs = s3Sink({ bucket: "acme-gcs", region: "auto", endpoint: "storage.googleapis.com", accessKeyId: "GOOG1", secretAccessKey: "x" }, t, "GCS");
    await gcs.put("x.csv", new Uint8Array([1]), "text/csv");
    expect(calls[1]?.url).toBe("https://storage.googleapis.com/acme-gcs/x.csv");
    expect(gcs.uri("x.csv")).toBe("gs://acme-gcs/x.csv");
    expect(() => s3Sink({ bucket: "../etc", region: "x", accessKeyId: "a", secretAccessKey: "b" }, t)).toThrow();
    const denied = s3Sink({ bucket: "acme-data", region: "eu-west-1", accessKeyId: "AK", secretAccessKey: "SK" }, async () => ({ status: 403, body: "" }));
    await expect(denied.put("a", new Uint8Array(), "x")).rejects.toThrow(/denied/);
  });

  it("Snowflake: valid RS256 key-pair JWT, COPY statements, executed after staging", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = snowflakeJwt({ account: "xy12345.us-east-1", user: "loader", privateKeyPem: pem }, 1_800_000_000);
    const [h, p, sig] = jwt.split(".") as [string, string, string];
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toMatchObject({ sub: "XY12345.LOADER", iat: 1_800_000_000, exp: 1_800_003_540 });
    expect(payload.iss).toMatch(/^XY12345\.LOADER\.SHA256:[A-Za-z0-9+/=]{44}$/);
    expect(verify("sha256", Buffer.from(`${h}.${p}`), createPublicKey(privateKey), Buffer.from(sig, "base64url"))).toBe(true);

    const cfg = { account: "xy12345.us-east-1", user: "loader", privateKeyPem: pem, warehouse: "load_wh", database: "vendor", schema: "founders", stage: "founders_stage" };
    const files = [
      { dataset: "companies", kind: "FULL" as const, key: "companies/companies_full_2026-11-25.parquet", uri: "", rows: 1, bytes: 1, sha256: "", format: "PARQUET" as const },
      { dataset: "companies", kind: "INCREMENTAL" as const, key: "companies/companies_2026-11-26.parquet", uri: "", rows: 1, bytes: 1, sha256: "", format: "PARQUET" as const },
    ];
    const st = snowflakeStatements(cfg, files, (k) => k);
    expect(st).toContain("TRUNCATE TABLE VENDOR.FOUNDERS.COMPANIES");
    expect(st.some((s) => s.startsWith("COPY INTO VENDOR.FOUNDERS.COMPANIES_CHANGES FROM @VENDOR.FOUNDERS.FOUNDERS_STAGE/companies/companies_2026-11-26.parquet"))).toBe(true);
    expect(() => snowflakeStatements({ ...cfg, database: "x; DROP" }, files, (k) => k)).toThrow(/identifier/);

    const calls: SinkRequest[] = [];
    const t = async (r: SinkRequest) => (calls.push(r), { status: 200, body: "{}" });
    const sf = snowflakeSink(cfg, s3Sink({ bucket: "acme-data", region: "us-east-1", accessKeyId: "a", secretAccessKey: "b" }, t), t);
    await sf.put(files[0]!.key, new Uint8Array([1]), "x");
    const res = await sf.finish!(files);
    const sql = calls.filter((c) => c.url === "https://xy12345.us-east-1.snowflakecomputing.com/api/v2/statements");
    expect(sql).toHaveLength(res.statements.length);
    expect(sql[0]?.headers["x-snowflake-authorization-token-type"]).toBe("KEYPAIR_JWT");
    expect(JSON.parse(String(sql[0]?.body)).warehouse).toBe("LOAD_WH");
  });

  it("local sink writes inside its directory only", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bulk-"));
    try {
      const s = localSink(dir);
      await s.put("companies/a.csv", new TextEncoder().encode("x"), "text/csv");
      expect(await readFile(path.join(dir, "companies/a.csv"), "utf8")).toBe("x");
      await expect(s.put("../escape.csv", new Uint8Array(), "text/csv")).rejects.toThrow(/escapes/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
