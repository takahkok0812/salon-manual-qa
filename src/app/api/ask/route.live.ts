import { cookies } from "next/headers";
import { createAnswerer } from "@/lib/answer";
import { ask, normalizeQuestion } from "@/lib/ask";
import { createEmbedder } from "@/lib/embed";
import { getIndexItems } from "@/lib/index-store";
import { DAILY_LIMIT, getQuotaStore, jstDay } from "@/lib/quota";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * 自由な質問に、実際にAIが答える。ログインした人だけ、1日 DAILY_LIMIT 回まで。
 * 回数は質問を受け付けた時点で数える（AIの呼び出しに失敗しても戻さない＝費用の上限を守る側に倒す）。
 */
export async function POST(request: Request) {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "ログインしてください" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { question?: unknown };
  const q = normalizeQuestion(body.question);
  if (!q.ok) return Response.json({ error: q.error }, { status: 400 });

  const quota = await getQuotaStore().take(session.sub, jstDay(), DAILY_LIMIT);
  if (!quota.ok) {
    return Response.json({ error: `今日の質問は${DAILY_LIMIT}回までです。明日また試してください`, remaining: 0 }, { status: 429 });
  }

  const embedder = createEmbedder();
  const result = await ask(q.question, { items: await getIndexItems(embedder), embedder, answerer: createAnswerer() });
  return Response.json({ ...result, remaining: DAILY_LIMIT - quota.used });
}
