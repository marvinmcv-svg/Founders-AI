/** `createAdapter(spec, client)` — the plan 13.1 adapter interface over a spec and a native client. */
import { KIND_LABEL, SPECS } from "./specs";
import type { CrmAdapter, CrmKind, CrmProvider, FieldMap, NativeClient, PushItem, PushKind, PushResult, PushValue } from "./types";

/** Push batches are chunked so one bad page never loses the rest (and vendors cap batch sizes). */
const PUSH_CHUNK = 50;

export function createAdapter(provider: CrmProvider, client: NativeClient): CrmAdapter {
  const spec = SPECS[provider];
  return {
    spec,
    async connect() {
      return { account: await client.whoami() };
    },
    listObjects() {
      return (Object.keys(spec.objects) as CrmKind[]).map((kind) => ({ kind, native: spec.objects[kind], label: KIND_LABEL[kind] }));
    },
    async pull(kind, cursor, limit = 100) {
      const page = await client.list(spec.objects[kind], cursor, limit);
      return { records: page.items.map((n) => spec.fromNative(kind, n)), next: page.next };
    },
    fieldMap(kind) {
      return { ...spec.defaultFieldMap[kind] };
    },
    async push(kind: PushKind, items: PushItem[], fieldMap?: FieldMap): Promise<PushResult[]> {
      const map = { ...spec.defaultFieldMap[kind], ...(fieldMap ?? {}) };
      // The dedupe key field is always written, whatever the custom map says.
      const keyOurs = kind === "COMPANY" ? "domain" : "linkedin_url";
      map[keyOurs] = spec.keyField[kind];
      const out: PushResult[] = [];
      for (let i = 0; i < items.length; i += PUSH_CHUNK) {
        const chunk = items.slice(i, i + PUSH_CHUNK).map((it) => {
          const fields: Record<string, PushValue> = {};
          for (const [ours, theirs] of Object.entries(map)) {
            const v = it.values[ours];
            if (v !== undefined && v !== null && theirs) fields[theirs] = v;
          }
          return { key: it.key, native: spec.toNative(kind, fields, it.owner ?? null) };
        });
        out.push(...(await client.upsert(spec.objects[kind], chunk, spec.keyField[kind], (n) => spec.keyOf(kind, n))));
      }
      return out;
    },
  };
}
