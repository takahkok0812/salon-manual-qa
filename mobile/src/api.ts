import {
  NOT_MENTIONED,
  SUMMARY_LABELS,
  type SummaryField,
  type SummaryResult,
} from "../../src/lib/summarize";

/**
 * Web版と同じ API（/api/session・/api/summarize）を呼ぶ。
 * ログインは Web版と同じデモ用アカウント（スタッフ）。セッションは HttpOnly Cookie で、
 * iOS・Android の fetch は Cookie を端末側で保持して次のリクエストに付ける。
 * 回数制限（1人1日5回・全体で1日30回）はサーバー側で数える。
 */

export const DEFAULT_API_BASE_URL =
  "https://main.d1viy15doium1g.amplifyapp.com";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface RemoteSummary {
  result: SummaryResult;
  /** 今日あと何回AIを使えるか（サーバーが返したとき） */
  remaining?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly remaining?: number,
  ) {
    super(message);
  }
}

/** サーバーの返事を確かめる。形が違えば表示しない（推測で埋めない）。 */
export function toSummaryResult(json: unknown): SummaryResult {
  const obj = json as { sentences?: unknown; fields?: unknown };
  if (
    !Array.isArray(obj?.sentences) ||
    !obj.sentences.every((s) => typeof s === "string")
  )
    throw new Error("要約の形式を読み取れませんでした");
  const sentences = obj.sentences as string[];
  const list = Array.isArray(obj.fields) ? obj.fields : [];
  const fields: SummaryField[] = SUMMARY_LABELS.map((label) => {
    const f = list.find(
      (x): x is { label: string; text?: unknown; sources?: unknown } =>
        typeof x === "object" &&
        x !== null &&
        (x as { label?: unknown }).label === label,
    );
    const sources = Array.isArray(f?.sources)
      ? f.sources.filter(
          (n): n is number =>
            Number.isInteger(n) && n >= 1 && n <= sentences.length,
        )
      : [];
    const text =
      typeof f?.text === "string" && f.text.trim()
        ? f.text.trim()
        : NOT_MENTIONED;
    if (text === NOT_MENTIONED || sources.length === 0)
      return { label, text: NOT_MENTIONED, sources: [] };
    return { label, text, sources };
  });
  return { sentences, fields };
}

export function createApiClient(
  baseUrl: string = DEFAULT_API_BASE_URL,
  fetchImpl: FetchLike = fetch,
) {
  const url = (path: string) => `${baseUrl.replace(/\/$/, "")}${path}`;
  const post = (path: string, body: unknown) =>
    fetchImpl(url(path), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let loggedIn = false;

  async function login(): Promise<void> {
    const res = await post("/api/session", { role: "staff" });
    if (!res.ok) throw new ApiError("ログインできませんでした", res.status);
    loggedIn = true;
  }

  async function summarize(memo: string): Promise<RemoteSummary> {
    if (!loggedIn) await login();
    let res = await post("/api/summarize", { memo });
    if (res.status === 401) {
      // Cookie の期限切れなど。1回だけログインし直す
      await login();
      res = await post("/api/summarize", { memo });
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: unknown;
      remaining?: unknown;
    };
    const remaining =
      typeof json.remaining === "number" ? json.remaining : undefined;
    if (!res.ok) {
      const message =
        typeof json.error === "string" ? json.error : "要約を作れませんでした";
      throw new ApiError(message, res.status, remaining);
    }
    return { result: toSummaryResult(json), remaining };
  }

  return { login, summarize };
}

export type ApiClient = ReturnType<typeof createApiClient>;
