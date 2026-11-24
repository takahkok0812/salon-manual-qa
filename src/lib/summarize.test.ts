import { describe, expect, it } from "vitest";
import { fakeGenerate, NOT_MENTIONED, normalizeMemo, parseSummary, splitSentences, SUMMARY_LABELS, summarizeMemo } from "./summarize";

describe("splitSentences", () => {
  it("句点・疑問符・改行で文に分ける", () => {
    expect(splitSentences("短くしたいです。傷みは気になりますか？\n次回はカラー")).toEqual(["短くしたいです。", "傷みは気になりますか？", "次回はカラー"]);
  });
  it("空白だけの文は捨てる", () => {
    expect(splitSentences("  \n\n。")).toEqual(["。"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("normalizeMemo", () => {
  it("空と長すぎるものを断る", () => {
    expect(normalizeMemo("").ok).toBe(false);
    expect(normalizeMemo("あ".repeat(1501)).ok).toBe(false);
    expect(normalizeMemo(" メモ ")).toEqual({ ok: true, memo: "メモ" });
  });
});

describe("parseSummary", () => {
  it("5項目を決まった順で返し、前置きがあってもJSONを読む", () => {
    const raw = `はい。{"fields":[{"label":"次回の提案","text":"1か月後にカラー","sources":[3]},{"label":"ご要望","text":"短くしたい","sources":[1]}]}`;
    const fields = parseSummary(raw, 3);
    expect(fields.map((f) => f.label)).toEqual([...SUMMARY_LABELS]);
    expect(fields[0]).toEqual({ label: "ご要望", text: "短くしたい", sources: [1] });
    expect(fields[3]).toEqual({ label: "次回の提案", text: "1か月後にカラー", sources: [3] });
    expect(fields[1]).toEqual({ label: "髪・頭皮の状態", text: NOT_MENTIONED, sources: [] });
  });

  it("範囲外・重複の番号は捨て、根拠の番号がない内容は「記載なし」にする", () => {
    const raw = JSON.stringify({
      fields: [
        { label: "ご要望", text: "短くしたい", sources: [2, 2, 9, 0, 1] },
        { label: "施術の内容", text: "パーマ", sources: [] },
      ],
    });
    const fields = parseSummary(raw, 2);
    expect(fields[0].sources).toEqual([1, 2]);
    expect(fields[2]).toEqual({ label: "施術の内容", text: NOT_MENTIONED, sources: [] });
  });

  it("JSONがなければ例外", () => {
    expect(() => parseSummary("まとめられませんでした", 1)).toThrow();
  });
});

describe("summarizeMemo", () => {
  it("文ごとの番号つきで渡し、結果に文の一覧を添える", async () => {
    let prompt = "";
    const r = await summarizeMemo("短くしたいです。毛先の傷みが気になります。", async (system, user) => {
      prompt = user;
      return fakeGenerate(system, user);
    });
    expect(prompt).toContain("[1] 短くしたいです。");
    expect(prompt).toContain("[2] 毛先の傷みが気になります。");
    expect(r.sentences).toHaveLength(2);
    expect(r.fields.find((f) => f.label === "ご要望")?.sources).toEqual([1]);
    expect(r.fields.find((f) => f.label === "髪・頭皮の状態")?.sources).toEqual([2]);
    expect(r.fields.find((f) => f.label === "次回の提案")?.text).toBe(NOT_MENTIONED);
  });
});
