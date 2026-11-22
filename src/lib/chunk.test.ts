import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { splitMarkdown, toEmbeddingInput, withLineChunks } from "./chunk";
import { loadSampleChunks, SAMPLES_DIR } from "./samples";

describe("splitMarkdown", () => {
  it("## 見出しごとに区切り、冒頭の注記は本文に入れない", () => {
    const md = "# 規程\n\n> 注記です\n\n## 1. はじめに\n本文A\n\n## 2. 手順\n本文B";
    const chunks = splitMarkdown("doc.md", md);
    expect(chunks.map((c) => c.heading)).toEqual(["1. はじめに", "2. 手順"]);
    expect(chunks[0].docTitle).toBe("規程");
    expect(chunks.some((c) => c.text.includes("注記"))).toBe(false);
  });

  it("長い区切りは段落の切れ目でさらに分け、IDが重ならない", () => {
    const long = Array.from({ length: 5 }, (_, i) => `段落${i}`.padEnd(300, "あ")).join("\n\n");
    const chunks = splitMarkdown("doc.md", `# T\n## 長い節\n${long}`, 800);
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((c) => c.chunkId)).size).toBe(chunks.length);
    expect(chunks.every((c) => c.text.length <= 800)).toBe(true);
  });

  it("埋め込みの入力には文書名と見出しが入る", () => {
    const [c] = splitMarkdown("doc.md", "# 規程\n## 手順\n本文");
    expect(toEmbeddingInput(c)).toBe("規程 / 手順\n本文");
  });

  it("用語集の用語を含む区切りには関連語を書き足し、含まない区切りは変えない", () => {
    const [a, b] = splitMarkdown("doc.md", "# 規程\n## 会計\n店販品の返品\n## 予約\n電話で受ける");
    const glossary = [{ term: "店販品", aliases: ["シャンプー", "トリートメント"] }];
    expect(toEmbeddingInput(a, glossary)).toBe("規程 / 会計\n店販品の返品\n（関連語：シャンプー、トリートメント）");
    expect(toEmbeddingInput(b, glossary)).toBe("規程 / 予約\n電話で受ける");
  });
});

describe("withLineChunks", () => {
  it("箇条書きが2項目以上ある区切りは、項目ごとの小さな区切りも作り、親のIDを持たせる", () => {
    const md = "# 規程\n## 会計\n- 支払いは現金\n- 返品は14日以内\n  レシートが必要\n## 一言\n- 1項目だけ";
    const chunks = withLineChunks(splitMarkdown("doc.md", md));
    const children = chunks.filter((c) => c.parentId);
    expect(children.map((c) => c.text)).toEqual(["- 支払いは現金", "- 返品は14日以内\n  レシートが必要"]);
    expect(children.every((c) => c.parentId === "doc.md::会計" && c.heading === "会計")).toBe(true);
    expect(new Set(chunks.map((c) => c.chunkId)).size).toBe(chunks.length);
    expect(chunks.filter((c) => c.heading === "一言")).toHaveLength(1);
  });
});

describe("サンプルのマニュアル", () => {
  it("評価用の質問の正解（文書・見出し）が、分割した区切りにすべて存在する", async () => {
    const chunks = await loadSampleChunks();
    const raw = await readFile(path.join(SAMPLES_DIR, "..", "eval", "questions.json"), "utf8");
    const { questions } = JSON.parse(raw) as {
      questions: { id: string; expected: { doc: string; heading: string }[] }[];
    };
    expect(questions.length).toBeGreaterThanOrEqual(20);
    for (const q of questions) {
      for (const e of q.expected) {
        const found = chunks.some((c) => c.docId === e.doc && c.heading === e.heading);
        expect(found, `${q.id}: ${e.doc} / ${e.heading}`).toBe(true);
      }
    }
  });
});
