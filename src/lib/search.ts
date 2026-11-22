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

/**
 * 小さな区切り（箇条書き1項目）も含めて似ている順に並べ、親の区切りにまとめて上位 k 件を返す。
 * 返す chunk は親（見出しの全文）、score はまとめた中で一番高い類似度。
 */
export function topSections(items: StoredChunk[], vector: number[], k: number): Hit[] {
  const byId = new Map(items.map((it) => [it.chunkId, it]));
  const best = new Map<string, Hit>();
  for (const { chunk, score } of topK(items, vector, items.length)) {
    const parentId = chunk.parentId ?? chunk.chunkId;
    if (best.has(parentId)) continue;
    const parent = byId.get(parentId);
    const parentChunk = parent ? withoutVector(parent) : chunk;
    best.set(parentId, { chunk: parentChunk, score });
    if (best.size >= k) break;
  }
  return [...best.values()];
}

function withoutVector(item: StoredChunk): Chunk {
  const chunk: Chunk & { vector?: number[] } = { ...item };
  delete chunk.vector;
  return chunk;
}

export class InMemoryVectorStore implements VectorStore {
  private items = new Map<string, StoredChunk>();

  async upsert(items: StoredChunk[]): Promise<void> {
    for (const item of items) this.items.set(item.chunkId, item);
  }

  async query(vector: number[], k: number): Promise<Hit[]> {
    return topSections([...this.items.values()], vector, k);
  }
}

/**
 * AIを呼ぶ前のふるい分けに使う類似度の下限。
 * Titan v2 の評価では、答えありの最小 0.273 と記載なしの最大 0.341 が重なり、類似度だけでは「記載なし」を判定できなかった。
 * そこで、ここでは明らかに無関係な質問だけを弾く（AIの呼び出し回数を減らす）低めの値にし、
 * 「記載なし」の最終判断は、根拠を渡したうえでAI（SYSTEM_PROMPT の指示）に任せる。
 */
export const DEFAULT_EVIDENCE_THRESHOLD = 0.2;

/**
 * 根拠になる区切りがあるかどうか。一番近い区切りの類似度が threshold 未満なら「記載なし」として扱う。
 * threshold は評価用の質問セット（samples/eval/questions.json）で調整する。
 */
export function hasEvidence(hits: Hit[], threshold: number): boolean {
  return hits.length > 0 && hits[0].score >= threshold;
}
