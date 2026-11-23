import { describe, expect, it } from "vitest";
import { FakeAnswerer } from "./answer";
import { ask, normalizeQuestion } from "./ask";
import { BigramEmbedder } from "./embed";
import { getIndexItems } from "./index-store";
import { jstDay, MemoryQuotaStore } from "./quota";
import { createSession, verifySession } from "./session";

const KEY = "test-secret";

describe("session", () => {
  it("作ったトークンは検証でき、ロールが戻る", () => {
    const { token } = createSession("manager", Date.now(), KEY);
    expect(verifySession(token, Date.now(), KEY)?.role).toBe("manager");
  });

  it("署名の改ざん・別の鍵・期限切れ・alg none は受け付けない", () => {
    const now = Date.now();
    const { token } = createSession("staff", now, KEY);
    const [h, b, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "x", role: "manager", exp: Math.floor(now / 1000) + 60 })).toString("base64url");
    expect(verifySession(`${h}.${forged}.${s}`, now, KEY)).toBeNull();
    expect(verifySession(token, now, "other-secret")).toBeNull();
    expect(verifySession(token, now + 25 * 60 * 60 * 1000, KEY)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(verifySession(`${none}.${b}.`, now, KEY)).toBeNull();
    expect(verifySession(undefined, now, KEY)).toBeNull();
  });
});

describe("quota", () => {
  it("1日の上限までは使え、超えると断り、日が変われば戻る", async () => {
    const q = new MemoryQuotaStore();
    expect(await q.take("u", "2026-11-23", 2)).toEqual({ ok: true, used: 1 });
    expect(await q.take("u", "2026-11-23", 2)).toEqual({ ok: true, used: 2 });
    expect((await q.take("u", "2026-11-23", 2)).ok).toBe(false);
    expect((await q.take("u", "2026-11-24", 2)).ok).toBe(true);
    expect((await q.take("v", "2026-11-23", 2)).ok).toBe(true);
  });

  it("日付は日本時間で区切る", () => {
    expect(jstDay(Date.parse("2026-11-23T15:30:00Z"))).toBe("2026-11-24");
    expect(jstDay(Date.parse("2026-11-23T14:30:00Z"))).toBe("2026-11-23");
  });
});

describe("ask", () => {
  it("質問の空・長すぎは断り、空白は詰める", () => {
    expect(normalizeQuestion("  有給は  何日前？ ")).toEqual({ ok: true, question: "有給は 何日前？" });
    expect(normalizeQuestion("").ok).toBe(false);
    expect(normalizeQuestion(123).ok).toBe(false);
    expect(normalizeQuestion("あ".repeat(201)).ok).toBe(false);
  });

  it("根拠つきで答え、根拠の番号と見出しを返す（AWSを呼ばない埋め込みと回答で）", async () => {
    const embedder = new BigramEmbedder();
    const items = await getIndexItems(embedder);
    const r = await ask("有給休暇は何日前までに申請が必要？", { items, embedder, answerer: new FakeAnswerer() });
    expect(r.noAnswer).toBe(false);
    expect(r.decidedBy).toBe("ai");
    expect(r.sources.map((s) => s.heading)).toContain("4. 有給休暇");
    expect(r.answer).toMatch(/\[1\]$/);
  });
});

describe("question log", async () => {
  const { MemoryQuestionLog } = await import("./question-log");
  it("記載なしと「役に立たなかった」だけを新しい順に返し、評価は本人の質問にだけつけられる", async () => {
    const log = new MemoryQuestionLog();
    const base = { role: "staff" as const, decidedBy: "ai" as const, headings: [] };
    const a = await log.add({ ...base, user: "u1", question: "社割は？", noAnswer: true });
    const b = await log.add({ ...base, user: "u1", question: "有給は？", noAnswer: false });
    await log.add({ ...base, user: "u2", question: "シフトは？", noAnswer: false });
    expect(await log.setFeedback(b.questionId, "u2", false)).toBe(false);
    expect(await log.setFeedback(b.questionId, "u1", false)).toBe(true);
    expect(await log.setFeedback("q#none", "u1", true)).toBe(false);
    const list = await log.listUnresolved(10);
    expect(list.map((r) => r.questionId).sort()).toEqual([a.questionId, b.questionId].sort());
  });
});
