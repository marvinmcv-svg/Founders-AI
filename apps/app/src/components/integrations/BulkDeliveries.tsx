"use client";
/** Settings → Bulk delivery (plan 13.5): datasets, format, sink, cadence; runs with manifests. Admin only. */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Badge, buttonClass, Card } from "@founders/ui";
import type { BulkDataset } from "@founders/core/repo";
import { bulkCreate, bulkDelete, bulkRun } from "@/app/integration-actions";

const input = "h-8 rounded-md border border-line bg-white/[0.03] px-2.5 text-[12.5px] text-ink outline-none focus:border-accent/50";
const DATASET_LABEL: Record<BulkDataset, string> = { companies: "Companies", people: "People", investors: "Investors", transactions: "Transactions", estimates: "Estimates (P10/P50/P90, anchors)" };

export type BulkView = {
  id: string;
  name: string;
  datasets: BulkDataset[];
  format: string;
  sink: string;
  cadence: string;
  status: string;
  last_run: string | null;
  runs: { id: string; kind: string; status: string; manifest: Record<string, unknown> | null; error: string | null; started_at: string }[];
};

export function BulkDeliveries({ deliveries, isAdmin }: { deliveries: BulkView[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", datasets: ["companies"] as BulkDataset[], format: "PARQUET" as "PARQUET" | "CSV", cadence: "DAILY" as "DAILY" | "WEEKLY" | "MANUAL", sink: "S3" as "S3" | "GCS" | "SNOWFLAKE", bucket: "", region: "us-east-1", prefix: "", accessKeyId: "", secretAccessKey: "", sfAccount: "", sfUser: "", sfWarehouse: "", sfDatabase: "", sfSchema: "", sfStage: "", sfKey: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  if (!isAdmin) return <p className="text-[13px] text-faint">Bulk delivery is set up by workspace admins under your data contract.</p>;
  const stage = { kind: (f.sink === "GCS" ? "GCS" : "S3") as "S3" | "GCS", bucket: f.bucket.trim(), region: f.region.trim(), prefix: f.prefix.trim(), accessKeyId: f.accessKeyId.trim(), secretAccessKey: f.secretAccessKey };
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      {deliveries.map((d) => (
        <Card key={d.id} className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{d.name}</span>
            <Badge tone="neutral">{d.sink.toLowerCase()}</Badge>
            <Badge tone="neutral">{d.format.toLowerCase()}</Badge>
            <Badge tone="neutral">{d.cadence.toLowerCase()}</Badge>
            {d.status === "ERROR" ? <Badge tone="negative">last run failed</Badge> : null}
            <span className="text-muted">{d.datasets.map((x) => DATASET_LABEL[x].split(" ")[0]).join(", ")}</span>
            <span className="ml-auto flex gap-2">
              <button className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => start(async () => { const r = await bulkRun(d.id); setMsg(r.ok ? { ok: true, text: `Delivered ${r.data.files} file(s), ${r.data.rows.toLocaleString()} rows.` } : { ok: false, text: r.error }); router.refresh(); })}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : null} Run now
              </button>
              <button className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => start(async () => { const r = await bulkRun(d.id, true); setMsg(r.ok ? { ok: true, text: `Full snapshot delivered (${r.data.rows.toLocaleString()} rows).` } : { ok: false, text: r.error }); router.refresh(); })}>
                Re-send full
              </button>
              <button className={buttonClass("danger", "sm")} disabled={pending} onClick={() => start(async () => { await bulkDelete(d.id); router.refresh(); })}>
                Delete
              </button>
            </span>
          </div>
          {d.runs.map((r) => {
            const files = (r.manifest?.files as { dataset: string; rows: number; upserts: number; deletes: number; uri: string }[] | undefined) ?? [];
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                <Badge tone={r.status === "SUCCEEDED" ? "positive" : r.status === "FAILED" ? "negative" : "neutral"}>{r.kind.toLowerCase()}</Badge>
                <span className="text-faint">{new Date(r.started_at).toLocaleString()}</span>
                {files.map((x) => (
                  <span key={x.dataset} className="text-muted" title={x.uri}>
                    {x.dataset}: {x.upserts.toLocaleString()} upsert{x.deletes ? ` · ${x.deletes} delete` : ""}
                  </span>
                ))}
                {r.error ? <span className="text-negative">{r.error}</span> : null}
              </div>
            );
          })}
        </Card>
      ))}
      {!deliveries.length && !open ? <p className="text-muted">No deliveries yet. The first run sends a full snapshot; later runs send daily incrementals with an op column and a manifest with checksums.</p> : null}
      {open ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <input aria-label="Delivery name" className={`${input} w-64`} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Delivery name" />
            <select aria-label="Format" className={input} value={f.format} onChange={(e) => set("format", e.target.value)}><option value="PARQUET">Parquet</option><option value="CSV">CSV</option></select>
            <select aria-label="Cadence" className={input} value={f.cadence} onChange={(e) => set("cadence", e.target.value)}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MANUAL">Manual</option></select>
            <select aria-label="Destination" className={input} value={f.sink} onChange={(e) => set("sink", e.target.value)}><option value="S3">Amazon S3</option><option value="GCS">Google Cloud Storage</option><option value="SNOWFLAKE">Snowflake</option></select>
          </div>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(DATASET_LABEL) as BulkDataset[]).map((ds) => (
              <label key={ds} className="flex items-center gap-1.5 text-text">
                <input type="checkbox" className="accent-[#d8ff4a]" checked={f.datasets.includes(ds)} onChange={(e) => setF((x) => ({ ...x, datasets: e.target.checked ? [...x.datasets, ds] : x.datasets.filter((y) => y !== ds) }))} />
                {DATASET_LABEL[ds]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {f.sink === "SNOWFLAKE" ? <span className="w-full text-[12px] text-muted">Staging bucket (an external stage in Snowflake points here):</span> : null}
            <input aria-label="Bucket" className={`${input} w-48`} value={f.bucket} onChange={(e) => set("bucket", e.target.value)} placeholder="bucket" />
            {f.sink !== "GCS" ? <input aria-label="Region" className={`${input} w-32`} value={f.region} onChange={(e) => set("region", e.target.value)} placeholder="region" /> : null}
            <input aria-label="Prefix" className={`${input} w-40`} value={f.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="prefix (optional)" />
            <input aria-label="Access key id" className={`${input} w-44`} value={f.accessKeyId} onChange={(e) => set("accessKeyId", e.target.value)} placeholder={f.sink === "GCS" ? "HMAC access id" : "access key id"} />
            <input aria-label="Secret access key" type="password" autoComplete="off" className={`${input} w-52`} value={f.secretAccessKey} onChange={(e) => set("secretAccessKey", e.target.value)} placeholder="secret" />
          </div>
          {f.sink === "SNOWFLAKE" ? (
            <div className="flex flex-wrap gap-2">
              {(["sfAccount", "sfUser", "sfWarehouse", "sfDatabase", "sfSchema", "sfStage"] as const).map((k) => (
                <input key={k} aria-label={k.slice(2)} className={`${input} w-36`} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={k.slice(2).toLowerCase()} />
              ))}
              <textarea aria-label="Private key" className="h-20 w-full rounded-md border border-line bg-white/[0.03] p-2 font-mono text-[11px] text-ink" value={f.sfKey} onChange={(e) => set("sfKey", e.target.value)} placeholder="-----BEGIN PRIVATE KEY----- (key-pair auth for the loader user)" />
            </div>
          ) : null}
          <p className="text-[12px] text-faint">Credentials are encrypted at rest and only sent to the bucket / Snowflake host, through our egress proxy.</p>
          <div className="flex gap-2">
            <button
              className={buttonClass("primary", "sm")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const sink =
                    f.sink === "SNOWFLAKE"
                      ? { kind: "SNOWFLAKE" as const, stage, snowflake: { account: f.sfAccount.trim(), user: f.sfUser.trim(), warehouse: f.sfWarehouse.trim(), database: f.sfDatabase.trim(), schema: f.sfSchema.trim(), stage: f.sfStage.trim(), privateKeyPem: f.sfKey } }
                      : f.sink === "GCS"
                        ? { kind: "GCS" as const, bucket: stage.bucket, prefix: stage.prefix, accessKeyId: stage.accessKeyId, secretAccessKey: stage.secretAccessKey }
                        : { kind: "S3" as const, bucket: stage.bucket, region: stage.region, prefix: stage.prefix, accessKeyId: stage.accessKeyId, secretAccessKey: stage.secretAccessKey };
                  const r = await bulkCreate({ name: f.name, datasets: f.datasets, format: f.format, cadence: f.cadence, sink });
                  setMsg(r.ok ? { ok: true, text: "Delivery created. Run it now or wait for the schedule." } : { ok: false, text: r.error });
                  if (r.ok) setOpen(false);
                  router.refresh();
                })
              }
            >
              Create delivery
            </button>
            <button className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Card>
      ) : (
        <div><button className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>New delivery</button></div>
      )}
      {msg ? <p role="status" className={msg.ok ? "text-positive" : "text-negative"}>{msg.text}</p> : null}
    </div>
  );
}
