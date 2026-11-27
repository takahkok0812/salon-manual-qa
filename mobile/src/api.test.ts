import { describe, expect, it } from "vitest";
import { NOT_MENTIONED } from "../../src/lib/summarize";
import {
  ApiError,
  createApiClient,
  toSummaryResult,
  type FetchLike,
} from "./api";

const okSummary = {
  sentences: ["肩まで切りたいです。", "前にカラーでしみました。"],
  fields: [
    { label: "ご要望", text: "肩までの長さにしたい。", sources: [1] },
    { label: "注意すること", text: "カラーでしみた経験あり。", sources: [2] },
  ],
  remaining: 4,
};

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("想定より多く呼ばれた");
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { impl, calls };
}

describe("createApiClient", () => {
  it("最初にログインしてから要約を呼び、Cookie を送る設定にする", async () => {
    const f = fakeFetch([
      { status: 200, body: { role: "staff" } },
      { status: 200, body: okSummary },
    ]);
    const client = createApiClient("https://example.test/", f.impl);
    const r = await client.summarize("メモ");
    expect(f.calls.map((c) => c.url)).toEqual([
      "https://example.test/api/session",
      "https://example.test/api/summarize",
    ]);
    expect(f.calls.every((c) => c.init?.credentials === "include")).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.result.fields.find((x) => x.label === "ご要望")?.sources).toEqual([
      1,
    ]);
  });

  it("2回目はログインを省く", async () => {
    const f = fakeFetch([
      { status: 200, body: { role: "staff" } },
      { status: 200, body: okSummary },
      { status: 200, body: okSummary },
    ]);
    const client = createApiClient("https://example.test", f.impl);
    await client.summarize("1");
    await client.summarize("2");
    expect(f.calls).toHaveLength(3);
  });

  it("401 のときは1回だけログインし直す", async () => {
    const f = fakeFetch([
      { status: 200, body: { role: "staff" } },
      { status: 401, body: { error: "ログインしてください" } },
      { status: 200, body: { role: "staff" } },
      { status: 200, body: okSummary },
    ]);
    const r = await createApiClient("https://example.test", f.impl).summarize(
      "メモ",
    );
    expect(r.result.sentences).toHaveLength(2);
    expect(f.calls.map((c) => c.url.split("/api/")[1])).toEqual([
      "session",
      "summarize",
      "session",
      "summarize",
    ]);
  });

  it("回数制限（429）はサーバーの文言と残り回数をそのまま返す", async () => {
    const f = fakeFetch([
      { status: 200, body: { role: "staff" } },
      {
        status: 429,
        body: {
          error: "今日のAIの利用は5回までです。明日また試してください",
          remaining: 0,
        },
      },
    ]);
    const err = await createApiClient("https://example.test", f.impl)
      .summarize("メモ")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).message).toContain("5回まで");
    expect((err as ApiError).remaining).toBe(0);
  });
});

describe("toSummaryResult", () => {
  it("5項目にそろえ、根拠の番号がない・範囲外の項目は「記載なし」にする", () => {
    const r = toSummaryResult({
      sentences: ["a"],
      fields: [
        { label: "ご要望", text: "x", sources: [5] },
        { label: "施術の内容", text: "y", sources: [1] },
        { label: "勝手な項目", text: "z", sources: [1] },
      ],
    });
    expect(r.fields).toHaveLength(5);
    expect(r.fields[0]).toEqual({
      label: "ご要望",
      text: NOT_MENTIONED,
      sources: [],
    });
    expect(r.fields.find((f) => f.label === "施術の内容")?.text).toBe("y");
  });

  it("形が違う返事は受け付けない", () => {
    expect(() => toSummaryResult({ fields: [] })).toThrow();
  });
});
