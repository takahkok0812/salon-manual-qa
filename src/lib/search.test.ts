import { describe, expect, it } from "vitest";
import type { StoredChunk } from "./search";
import { cosineSimilarity, hasEvidence, InMemoryVectorStore, topSections } from "./search";
import { buildUserPrompt, NO_ANSWER, SYSTEM_PROMPT } from "./prompt";

const chunk = (id: string, vector: number[]): StoredChunk => ({
  docId: `${id}.md`,
  docTitle: `文書${id}`,
  heading: `見出し${id}`,
  text: `本文${id}`,
  chunkId: id,
  vector,
});

describe("cosineSimilarity", () => {
  it("同じ向きは1、直交は0", () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("次元が違えばエラーにする", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
});

describe("InMemoryVectorStore", () => {
  it("近い順に上位k件を返し、同じIDは上書きする", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert([chunk("a", [1, 0]), chunk("b", [0, 1]), chunk("c", [0.7, 0.7])]);
    await store.upsert([chunk("b", [0.9, 0.1])]);
    const hits = await store.query([1, 0], 2);
    expect(hits.map((h) => h.chunk.chunkId)).toEqual(["a", "b"]);
    expect(hits[0]).not.toHaveProperty("chunk.vector");
  });
});

describe("topSections", () => {
  it("小さな区切りで当たったら親の区切りを返し、同じ親は1件にまとめる", () => {
    const parent = chunk("p", [0, 1]);
    const childA = { ...chunk("p::1", [1, 0]), parentId: "p", text: "項目A" };
    const childB = { ...chunk("p::2", [0.9, 0.1]), parentId: "p", text: "項目B" };
    const other = chunk("o", [0.7, 0.7]);
    const hits = topSections([parent, childA, childB, other], [1, 0], 2);
    expect(hits.map((h) => h.chunk.chunkId)).toEqual(["p", "o"]);
    expect(hits[0].chunk.text).toBe("本文p");
    expect(hits[0].score).toBeCloseTo(1);
    expect("vector" in hits[0].chunk).toBe(false);
  });
});

describe("hasEvidence", () => {
  it("一番近い区切りがしきい値未満なら根拠なし", () => {
    const hit = (score: number) => ({ chunk: chunk("a", [1]), score });
    expect(hasEvidence([hit(0.6)], 0.5)).toBe(true);
    expect(hasEvidence([hit(0.4)], 0.5)).toBe(false);
    expect(hasEvidence([], 0.5)).toBe(false);
  });
});

describe("プロンプト", () => {
  it("資料に番号を振り、根拠がないときの決まり文句を指示する", () => {
    const p = buildUserPrompt("有給は？", [{ chunk: chunk("a", [1]), score: 0.9 }]);
    expect(p).toContain('<source id="1" doc="文書a" heading="見出しa">');
    expect(p).toContain("質問：有給は？");
    expect(SYSTEM_PROMPT).toContain(NO_ANSWER);
  });
});
