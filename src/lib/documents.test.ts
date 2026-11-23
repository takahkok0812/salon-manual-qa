import { describe, expect, it } from "vitest";
import { statusOf } from "./documents";
import { BigramEmbedder } from "./embed";
import { visibleTo } from "./index-store";
import { buildItems, docIdFromKey, ownerOf, userDocId, validateUpload } from "./ingest";

describe("ingest", () => {
  it("S3のキーから文書IDと持ち主を取り出す", () => {
    expect(docIdFromKey("manuals/01_予約・受付.md")).toBe("01_予約・受付.md");
    expect(ownerOf("01_予約・受付.md")).toBeUndefined();
    const id = userDocId("demo-manager-ab12", "社員旅行.md");
    expect(docIdFromKey(`manuals/${id}`)).toBe("u/demo-manager-ab12/社員旅行.md");
    expect(ownerOf(id)).toBe("demo-manager-ab12");
  });

  it("ファイル名・中身を確かめる", () => {
    expect(validateUpload("社員旅行.md", "# 規程\n## 1. 時期\n- 5月").ok).toBe(true);
    expect(validateUpload("../etc/passwd.md", "x").ok).toBe(false);
    expect(validateUpload("a.pdf", "x").ok).toBe(false);
    expect(validateUpload("a.md", "  ").ok).toBe(false);
    expect(validateUpload("a.md", "あ".repeat(30_001)).ok).toBe(false);
  });

  it("アップロード文書の区切りには持ち主と24時間後の期限がつき、サンプルにはつかない", async () => {
    const now = Date.parse("2026-11-23T00:00:00Z");
    const md = "# 規程\n## 1. 時期\n- 社員旅行は毎年5月\n- 行き先は投票で決める";
    const mine = await buildItems(userDocId("u1", "旅行.md"), md, new BigramEmbedder(), [], now);
    expect(mine.length).toBeGreaterThan(1);
    expect(mine.every((i) => i.owner === "u1" && i.expiresAt === now / 1000 + 86400)).toBe(true);
    const sample = await buildItems("01.md", md, new BigramEmbedder(), [], now);
    expect(sample.every((i) => i.owner === undefined && i.expiresAt === undefined)).toBe(true);
  });
});

describe("documents", () => {
  it("区切りがあれば完了、なければアップロードから3分までは処理中、それ以降は失敗", () => {
    const now = Date.now();
    expect(statusOf(5, undefined, now)).toBe("done");
    expect(statusOf(0, new Date(now - 60_000), now)).toBe("processing");
    expect(statusOf(0, new Date(now - 4 * 60_000), now)).toBe("failed");
  });

  it("検索に使えるのは、サンプルと自分がアップロードした文書だけ", () => {
    const base = { docTitle: "t", heading: "h", text: "x", vector: [1] };
    const items = [
      { ...base, docId: "s.md", chunkId: "s" },
      { ...base, docId: "u/a/x.md", chunkId: "a", owner: "a" },
      { ...base, docId: "u/b/y.md", chunkId: "b", owner: "b" },
    ];
    expect(visibleTo(items, "a").map((i) => i.chunkId)).toEqual(["s", "a"]);
  });
});
