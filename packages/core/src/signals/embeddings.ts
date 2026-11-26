/**
 * Embeddings (plan 9.7, 0A: one model, dimension EMBEDDING_DIM = 256 in the schema).
 * `EmbeddingProvider` is the swap point for a hosted embedding model (needs a key — H3).
 * Until then `HashingTfidfEmbedder` is the v1 model: TF-IDF over unigrams + bigrams, fitted on the
 * company corpus, projected to 256 dims with signed feature hashing and L2-normalised.
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_DIM = 256;

const STOP = new Set(
  ("the a an and or for of to in on at by with from into over its it is are was were be been this that these those our their " +
    "company companies founded headquartered sells through model focuses builds build building helps helping making make simple " +
    "platform operating system faster grow teams team based new more").split(" "),
);

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  const bigrams = words.slice(0, -1).map((w, i) => `${w}_${words[i + 1]}`);
  return [...words, ...bigrams];
}

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class HashingTfidfEmbedder implements EmbeddingProvider {
  readonly name = "hashing-tfidf-256";
  readonly dim: number;
  private idf = new Map<string, number>();
  private defaultIdf = 1;

  constructor(dim = EMBEDDING_DIM) {
    this.dim = dim;
  }

  /** Learn IDF from a corpus of token lists. */
  fit(docs: string[][]): this {
    const df = new Map<string, number>();
    for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
    const n = docs.length || 1;
    for (const [t, c] of df) this.idf.set(t, Math.log((1 + n) / (1 + c)) + 1);
    this.defaultIdf = Math.log(1 + n) + 1;
    return this;
  }

  embedTokens(tokens: string[]): number[] {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Array<number>(this.dim).fill(0);
    for (const [t, c] of tf) {
      const h = hash32(t);
      const w = (1 + Math.log(c)) * (this.idf.get(t) ?? this.defaultIdf);
      const i = h % this.dim;
      v[i] = (v[i] as number) + ((h >>> 31) & 1 ? -w : w);
    }
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    return v.map((x) => Math.round((x / norm) * 1e5) / 1e5);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedTokens(tokenize(t)));
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number, y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** pgvector literal. */
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;
