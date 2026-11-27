import { describe, expect, it } from "vitest";
import { fakeGenerate, summarizeMemo } from "../../src/lib/summarize";
import { filledCount, recordsReducer, recordTitle, SAMPLE_MEMO, sourceSentences, type CounselingRecord } from "./records";

async function makeRecord(id: string, memo = SAMPLE_MEMO): Promise<CounselingRecord> {
  return { id, createdAt: 0, memo, result: await summarizeMemo(memo, fakeGenerate) };
}

describe("records", () => {
  it("見本のメモが、通信なしで5項目にまとまり根拠の番号が付く", async () => {
    const r = await makeRecord("a");
    expect(r.result.fields.map((f) => f.label)).toEqual(["ご要望", "髪・頭皮の状態", "施術の内容", "次回の提案", "注意すること"]);
    expect(filledCount(r.result)).toBe(5);
    for (const f of r.result.fields) expect(sourceSentences(r.result, f.sources).length).toBeGreaterThan(0);
  });

  it("追加は先頭に入り、同じ id は二重に入らない。削除できる", async () => {
    const a = await makeRecord("a");
    const b = await makeRecord("b");
    let s = recordsReducer([], { type: "add", record: a });
    s = recordsReducer(s, { type: "add", record: b });
    s = recordsReducer(s, { type: "add", record: a });
    expect(s.map((r) => r.id)).toEqual(["b", "a"]);
    expect(recordsReducer(s, { type: "remove", id: "b" }).map((r) => r.id)).toEqual(["a"]);
  });

  it("見出しはご要望を短くしたもの。ご要望がなければメモの書き出し", async () => {
    const a = await makeRecord("a");
    expect(recordTitle(a).length).toBeLessThanOrEqual(24);
    const c = await makeRecord("c", "お会計はカードで");
    expect(recordTitle(c)).toBe("お会計はカードで");
  });

  it("範囲外の根拠の番号は無視する", async () => {
    const a = await makeRecord("a");
    expect(sourceSentences(a.result, [0, 1, 999])).toHaveLength(1);
  });
});
