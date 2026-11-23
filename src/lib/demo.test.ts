import { describe, expect, it } from "vitest";
import { citedNumbers, splitCitations } from "./demo";

describe("splitCitations", () => {
  it("本文と根拠番号に分ける", () => {
    expect(splitCitations("2週間前まで[1]。フォームから [2]", 3)).toEqual([
      { kind: "text", text: "2週間前まで" },
      { kind: "cite", n: 1 },
      { kind: "text", text: "。フォームから " },
      { kind: "cite", n: 2 },
    ]);
  });

  it("根拠の数を超える番号は本文のまま残す", () => {
    expect(splitCitations("A [4]", 3)).toEqual([{ kind: "text", text: "A [4]" }]);
  });
});

describe("citedNumbers", () => {
  it("参照された番号を重複なく出てきた順に返す", () => {
    expect(citedNumbers("a [2] b [1] c [2]", 3)).toEqual([2, 1]);
  });
});
