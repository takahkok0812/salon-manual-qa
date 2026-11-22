import type { Chunk } from "./chunk";

export type StoredChunk = Chunk & { vector: number[] };
export type Hit = { chunk: Chunk; score: number };

/**
 * ベクトル検索の差し替え口。
 * デモでは件数が少ない（数千件まで）ので、サーバー側で類似度を計算する実装を使う。
 * 件数が増えたら pgvector などの実装に差し替える。
 */
export interface VectorStore {
  upsert(items: StoredChunk[]): Promise<void>;
  query(vector: number[], k: number): Promise<Hit[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`次元が違います: ${a.length} と ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function topK(items: StoredChunk[], vector: number[], k: number): Hit[] {
  return items
    .map(({ vector: v, ...chunk }) => ({ chunk, score: cosineSimilarity(v, vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}

export class InMemoryVectorStore implements VectorStore {
  private items = new Map<string, StoredChunk>();

  async upsert(items: StoredChunk[]): Promise<void> {
    for (const item of items) this.items.set(item.chunkId, item);
  }

  async query(vector: number[], k: number): Promise<Hit[]> {
    return topK([...this.items.values()], vector, k);
  }
}

/**
 * 根拠になる区切りがあるかどうか。一番近い区切りの類似度が threshold 未満なら「記載なし」として扱う。
 * threshold は評価用の質問セット（samples/eval/questions.json）で調整する。
 */
export function hasEvidence(hits: Hit[], threshold: number): boolean {
  return hits.length > 0 && hits[0].score >= threshold;
}
