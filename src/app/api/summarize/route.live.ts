import { cookies } from "next/headers";
import { createAnswerer } from "@/lib/answer";
import { DAILY_LIMIT, getQuotaStore, GLOBAL_DAILY_LIMIT, GLOBAL_USER, jstDay } from "@/lib/quota";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { normalizeMemo, summarizeMemo } from "@/lib/summarize";

/**
 * 音声メモ（書き起こし）をカウンセリング記録にまとめる。ログインした人だけ。
 * AIを呼ぶので、質問と同じ1日の回数（1人・全体）を使う。数えるのはAIを呼ぶ前。
 */
export async function POST(request: Request) {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "ログインしてください" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { memo?: unknown };
  const m = normalizeMemo(body.memo);
  if (!m.ok) return Response.json({ error: m.error }, { status: 400 });

  const day = jstDay();
  const quota = await getQuotaStore().take(session.sub, day, DAILY_LIMIT);
  if (!quota.ok) {
    return Response.json({ error: `今日のAIの利用は${DAILY_LIMIT}回までです。明日また試してください`, remaining: 0 }, { status: 429 });
  }
  const global = await getQuotaStore().take(GLOBAL_USER, day, GLOBAL_DAILY_LIMIT);
  if (!global.ok) {
    return Response.json(
      { error: "デモ全体の今日のAIの利用回数が上限に達しました。明日また試してください", remaining: DAILY_LIMIT - quota.used },
      { status: 429 },
    );
  }

  const answerer = createAnswerer();
  try {
    const result = await summarizeMemo(m.memo, (system, user) => answerer.generate(system, user));
    return Response.json({ ...result, remaining: DAILY_LIMIT - quota.used });
  } catch {
    return Response.json({ error: "要約を作れませんでした。言い回しを変えて試してください", remaining: DAILY_LIMIT - quota.used }, { status: 502 });
  }
}
