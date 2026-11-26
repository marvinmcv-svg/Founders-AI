/**
 * Minimal Apache Parquet writer (and reader for tests / replay), no dependencies.
 *
 * Subset: one row group, flat schema, every column OPTIONAL, data page v1, PLAIN values, RLE
 * definition levels (bit width 1), UNCOMPRESSED. Types: UTF8 strings (BYTE_ARRAY), INT64, DOUBLE,
 * BOOLEAN. Metadata uses the Thrift compact protocol as in parquet-format's `parquet.thrift`.
 * Readers (Spark, DuckDB, pyarrow, Snowflake, BigQuery) all accept this subset.
 */

export type ParquetType = "string" | "int" | "double" | "bool";
export type ParquetColumn = { name: string; type: ParquetType };
export type ParquetValue = string | number | boolean | null | undefined;

const MAGIC = new TextEncoder().encode("PAR1");
const PHYSICAL: Record<ParquetType, number> = { bool: 0, int: 2, double: 5, string: 6 }; // BOOLEAN, INT64, DOUBLE, BYTE_ARRAY
const CONVERTED_UTF8 = 0;
const ENC_PLAIN = 0;
const ENC_RLE = 3;

/* ---------------- byte buffer ---------------- */

class Bytes {
  private buf = new Uint8Array(1024);
  length = 0;
  private grow(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  byte(b: number) {
    this.grow(1);
    this.buf[this.length++] = b & 0xff;
  }
  bytes(b: Uint8Array) {
    this.grow(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  u32(n: number) {
    this.grow(4);
    new DataView(this.buf.buffer).setUint32(this.length, n >>> 0, true);
    this.length += 4;
  }
  i64(n: bigint) {
    this.grow(8);
    new DataView(this.buf.buffer).setBigInt64(this.length, n, true);
    this.length += 8;
  }
  f64(n: number) {
    this.grow(8);
    new DataView(this.buf.buffer).setFloat64(this.length, n, true);
    this.length += 8;
  }
  uvarint(n: bigint | number) {
    let v = BigInt(n);
    do {
      let b = Number(v & 0x7fn);
      v >>= 7n;
      if (v) b |= 0x80;
      this.byte(b);
    } while (v);
  }
  out() {
    return this.buf.slice(0, this.length);
  }
}

/* ---------------- Thrift compact writer ---------------- */

const T = { TRUE: 1, FALSE: 2, I32: 5, I64: 6, DOUBLE: 7, BINARY: 8, LIST: 9, STRUCT: 12 } as const;
type TValue = { t: "i32" | "i64"; v: number | bigint } | { t: "bin"; v: string | Uint8Array } | { t: "bool"; v: boolean } | { t: "struct"; v: TStruct } | { t: "list"; elem: "i32" | "bin" | "struct"; v: TValue[] };
type TStruct = [number, TValue | undefined][];

const zz = (n: bigint) => (n << 1n) ^ (n >> 63n);
const typeOf = (x: TValue): number =>
  x.t === "i32" ? T.I32 : x.t === "i64" ? T.I64 : x.t === "bin" ? T.BINARY : x.t === "bool" ? (x.v ? T.TRUE : T.FALSE) : x.t === "struct" ? T.STRUCT : T.LIST;

function writeValue(b: Bytes, x: TValue) {
  switch (x.t) {
    case "i32":
    case "i64":
      b.uvarint(zz(BigInt(x.v)) & 0xffffffffffffffffn);
      break;
    case "bin": {
      const bytes = typeof x.v === "string" ? new TextEncoder().encode(x.v) : x.v;
      b.uvarint(bytes.length);
      b.bytes(bytes);
      break;
    }
    case "bool":
      break; // encoded in the field header
    case "struct":
      writeStruct(b, x.v);
      break;
    case "list": {
      const et = x.elem === "i32" ? T.I32 : x.elem === "bin" ? T.BINARY : T.STRUCT;
      if (x.v.length < 15) b.byte((x.v.length << 4) | et);
      else {
        b.byte(0xf0 | et);
        b.uvarint(x.v.length);
      }
      for (const e of x.v) writeValue(b, e);
      break;
    }
  }
}

function writeStruct(b: Bytes, fields: TStruct) {
  let last = 0;
  for (const [id, val] of fields) {
    if (val === undefined) continue;
    const delta = id - last;
    if (delta > 0 && delta <= 15) b.byte((delta << 4) | typeOf(val));
    else {
      b.byte(typeOf(val));
      b.uvarint(zz(BigInt(id)));
    }
    writeValue(b, val);
    last = id;
  }
  b.byte(0); // STOP
}

const i32 = (v: number): TValue => ({ t: "i32", v });
const i64 = (v: number | bigint): TValue => ({ t: "i64", v });
const bin = (v: string | Uint8Array): TValue => ({ t: "bin", v });
const struct = (v: TStruct): TValue => ({ t: "struct", v });

/* ---------------- encoding ---------------- */

/** RLE/bit-packed hybrid with bit width 1, RLE runs only, prefixed by its 4-byte length (data page v1). */
function encodeDefLevels(defined: boolean[]): Uint8Array {
  const runs = new Bytes();
  let i = 0;
  while (i < defined.length) {
    let j = i;
    while (j < defined.length && defined[j] === defined[i]) j++;
    runs.uvarint((j - i) << 1);
    runs.byte(defined[i] ? 1 : 0);
    i = j;
  }
  const body = runs.out();
  const out = new Bytes();
  out.u32(body.length);
  out.bytes(body);
  return out.out();
}

function encodeValues(type: ParquetType, values: ParquetValue[]): Uint8Array {
  const b = new Bytes();
  const enc = new TextEncoder();
  if (type === "bool") {
    let cur = 0;
    let n = 0;
    for (const v of values) {
      if (v) cur |= 1 << n;
      if (++n === 8) {
        b.byte(cur);
        cur = 0;
        n = 0;
      }
    }
    if (n) b.byte(cur);
    return b.out();
  }
  for (const v of values) {
    if (type === "int") b.i64(BigInt(Math.trunc(Number(v))));
    else if (type === "double") b.f64(Number(v));
    else {
      const s = enc.encode(String(v));
      b.u32(s.length);
      b.bytes(s);
    }
  }
  return b.out();
}

/** Coerce a value for a column; objects become JSON strings, empty strings stay strings. */
export function coerce(type: ParquetType, v: unknown): ParquetValue {
  if (v === null || v === undefined) return null;
  if (type === "string") return typeof v === "string" ? v : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (type === "bool") return Boolean(v);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function writeParquet(columns: ParquetColumn[], rows: Record<string, unknown>[], meta: Record<string, string> = {}): Uint8Array {
  const file = new Bytes();
  file.bytes(MAGIC);
  const chunks: TValue[] = [];
  let totalBytes = 0;
  for (const col of columns) {
    const vals = rows.map((r) => coerce(col.type, r[col.name]));
    const defined = vals.map((v) => v !== null && v !== undefined);
    const levels = encodeDefLevels(defined);
    const data = encodeValues(col.type, vals.filter((_, i) => defined[i]));
    const pageSize = levels.length + data.length;
    const header = new Bytes();
    writeStruct(header, [
      [1, i32(0)], // DATA_PAGE
      [2, i32(pageSize)],
      [3, i32(pageSize)],
      [5, struct([[1, i32(rows.length)], [2, i32(ENC_PLAIN)], [3, i32(ENC_RLE)], [4, i32(ENC_RLE)]])],
    ]);
    const offset = file.length;
    const h = header.out();
    file.bytes(h);
    file.bytes(levels);
    file.bytes(data);
    const size = h.length + pageSize;
    totalBytes += size;
    chunks.push(
      struct([
        [2, i64(offset)],
        [
          3,
          struct([
            [1, i32(PHYSICAL[col.type])],
            [2, { t: "list", elem: "i32", v: [i32(ENC_PLAIN), i32(ENC_RLE)] }],
            [3, { t: "list", elem: "bin", v: [bin(col.name)] }],
            [4, i32(0)], // UNCOMPRESSED
            [5, i64(rows.length)],
            [6, i64(size)],
            [7, i64(size)],
            [9, i64(offset)],
          ]),
        ],
      ]),
    );
  }
  const schema: TValue[] = [
    struct([
      [4, bin("schema")],
      [5, i32(columns.length)],
    ]),
    ...columns.map((c) =>
      struct([
        [1, i32(PHYSICAL[c.type])],
        [3, i32(1)], // OPTIONAL
        [4, bin(c.name)],
        [6, c.type === "string" ? i32(CONVERTED_UTF8) : undefined],
      ]),
    ),
  ];
  const kv = Object.entries(meta).map(([k, v]) => struct([[1, bin(k)], [2, bin(v)]]));
  const footer = new Bytes();
  writeStruct(footer, [
    [1, i32(1)],
    [2, { t: "list", elem: "struct", v: schema }],
    [3, i64(rows.length)],
    [4, { t: "list", elem: "struct", v: [struct([[1, { t: "list", elem: "struct", v: chunks }], [2, i64(totalBytes)], [3, i64(rows.length)]])] }],
    [5, kv.length ? { t: "list", elem: "struct", v: kv } : undefined],
    [6, bin("founders-ai bulk 1.0")],
  ]);
  const f = footer.out();
  file.bytes(f);
  file.u32(f.length);
  file.bytes(MAGIC);
  return file.out();
}

/* ---------------- reader (same subset; used by replay tests and manifest checks) ---------------- */

type TRead = Map<number, unknown>;

class Reader {
  pos = 0;
  constructor(readonly b: Uint8Array) {}
  byte() {
    return this.b[this.pos++] as number;
  }
  uvarint(): bigint {
    let shift = 0n;
    let out = 0n;
    for (;;) {
      const x = this.byte();
      out |= BigInt(x & 0x7f) << shift;
      if (!(x & 0x80)) return out;
      shift += 7n;
    }
  }
  zigzag(): bigint {
    const n = this.uvarint();
    return (n >> 1n) ^ -(n & 1n);
  }
  value(type: number): unknown {
    switch (type) {
      case T.TRUE:
        return true;
      case T.FALSE:
        return false;
      case 3:
        return this.byte();
      case 4:
      case T.I32:
        return Number(this.zigzag());
      case T.I64:
        return this.zigzag();
      case T.DOUBLE: {
        const v = new DataView(this.b.buffer, this.b.byteOffset + this.pos, 8).getFloat64(0, true);
        this.pos += 8;
        return v;
      }
      case T.BINARY: {
        const n = Number(this.uvarint());
        const v = this.b.slice(this.pos, this.pos + n);
        this.pos += n;
        return v;
      }
      case T.LIST:
      case 10: {
        const h = this.byte();
        let n = h >> 4;
        if (n === 15) n = Number(this.uvarint());
        const et = h & 0x0f;
        return Array.from({ length: n }, () => (et === T.TRUE || et === T.FALSE ? this.byte() === 1 : this.value(et)));
      }
      case T.STRUCT:
        return this.struct();
      default:
        throw new Error(`Unsupported thrift type ${type}`);
    }
  }
  struct(): TRead {
    const out: TRead = new Map();
    let last = 0;
    for (;;) {
      const h = this.byte();
      if (h === 0) return out;
      const delta = h >> 4;
      const id = delta ? last + delta : Number(this.zigzag());
      out.set(id, this.value(h & 0x0f));
      last = id;
    }
  }
}

const dec = new TextDecoder();
const asMap = (x: unknown) => x as TRead;

export function readParquet(file: Uint8Array): { columns: ParquetColumn[]; rows: Record<string, ParquetValue>[]; meta: Record<string, string> } {
  const tail = dec.decode(file.slice(file.length - 4));
  if (dec.decode(file.slice(0, 4)) !== "PAR1" || tail !== "PAR1") throw new Error("Not a Parquet file");
  const len = new DataView(file.buffer, file.byteOffset + file.length - 8, 4).getUint32(0, true);
  const fm = new Reader(file.subarray(file.length - 8 - len, file.length - 8)).struct();
  const schema = (fm.get(2) as TRead[]).slice(1);
  const byType = Object.fromEntries(Object.entries(PHYSICAL).map(([k, v]) => [v, k])) as Record<number, ParquetType>;
  const columns = schema.map((s) => ({ name: dec.decode(s.get(4) as Uint8Array), type: byType[s.get(1) as number] as ParquetType }));
  const numRows = Number(fm.get(3) as bigint);
  const rows: Record<string, ParquetValue>[] = Array.from({ length: numRows }, () => ({}));
  const rg = (fm.get(4) as TRead[])[0];
  const chunks = rg ? (rg.get(1) as TRead[]) : [];
  chunks.forEach((cc, ci) => {
    const md = asMap(cc.get(3));
    const col = columns[ci] as ParquetColumn;
    const r = new Reader(file);
    r.pos = Number(md.get(9) as bigint);
    const ph = r.struct();
    const dph = asMap(ph.get(5));
    const n = dph.get(1) as number;
    const dv = new DataView(file.buffer, file.byteOffset);
    const levelLen = dv.getUint32(r.pos, true);
    r.pos += 4;
    const levelEnd = r.pos + levelLen;
    const defined: boolean[] = [];
    while (r.pos < levelEnd) {
      const head = Number(r.uvarint());
      if (head & 1) throw new Error("Bit-packed runs are not supported by this reader");
      const v = r.byte() === 1;
      for (let k = 0; k < head >> 1; k++) defined.push(v);
    }
    const present = defined.filter(Boolean).length;
    const values: ParquetValue[] = [];
    for (let k = 0; k < present; k++) {
      if (col.type === "bool") values.push(((file[r.pos + (k >> 3)] as number) >> (k & 7)) & 1 ? true : false);
      else if (col.type === "int") {
        values.push(Number(dv.getBigInt64(r.pos, true)));
        r.pos += 8;
      } else if (col.type === "double") {
        values.push(dv.getFloat64(r.pos, true));
        r.pos += 8;
      } else {
        const l = dv.getUint32(r.pos, true);
        values.push(dec.decode(file.subarray(r.pos + 4, r.pos + 4 + l)));
        r.pos += 4 + l;
      }
    }
    let vi = 0;
    for (let k = 0; k < n; k++) (rows[k] as Record<string, ParquetValue>)[col.name] = defined[k] ? (values[vi++] as ParquetValue) : null;
  });
  const meta: Record<string, string> = {};
  for (const kv of (fm.get(5) as TRead[] | undefined) ?? []) meta[dec.decode(kv.get(1) as Uint8Array)] = dec.decode(kv.get(2) as Uint8Array);
  return { columns, rows, meta };
}
