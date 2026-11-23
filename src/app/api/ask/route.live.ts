import { cookies } from "next/headers";
import { createAnswerer } from "@/lib/answer";
import { ask, normalizeQuestion } from "@/lib/ask";
import { createEmbedder } from "@/lib/embed";
import { getIndexItems } from "@/lib/index-store";
import { getQuestionLog } from "@/lib/question-log";
import { DAILY_LIMIT, getQuotaStore, GLOBAL_DAILY_LIMIT, GLOBAL_USER, jstDay } from "@/lib/quota";
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

  const day = jstDay();
  const quota = await getQuotaStore().take(session.sub, day, DAILY_LIMIT);
  if (!quota.ok) {
    return Response.json({ error: `今日の質問は${DAILY_LIMIT}回までです。明日また試してください`, remaining: 0 }, { status: 429 });
  }
  const global = await getQuotaStore().take(GLOBAL_USER, day, GLOBAL_DAILY_LIMIT);
  if (!global.ok) {
    return Response.json(
      { error: "デモ全体の今日の質問回数が上限に達しました。明日また試すか、用意した質問のデモをご覧ください", remaining: DAILY_LIMIT - quota.used },
      { status: 429 },
    );
  }

  const embedder = createEmbedder();
  const result = await ask(q.question, { items: await getIndexItems(embedder), embedder, answerer: createAnswerer() });
  const log = await getQuestionLog().add({
    user: session.sub,
    role: session.role,
    question: result.question,
    noAnswer: result.noAnswer,
    decidedBy: result.decidedBy,
    headings: result.sources.map((s) => `${s.docTitle} / ${s.heading}`),
  });
  return Response.json({ ...result, questionId: log.questionId, remaining: DAILY_LIMIT - quota.used });
}
