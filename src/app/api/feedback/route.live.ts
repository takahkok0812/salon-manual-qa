import { cookies } from "next/headers";
import { getQuestionLog } from "@/lib/question-log";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** 回答に「役に立った／立たなかった」をつける（本人の質問だけ）。 */
export async function POST(request: Request) {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { questionId?: unknown; helpful?: unknown };
  if (typeof body.questionId !== "string" || typeof body.helpful !== "boolean") {
    return Response.json({ error: "questionId と helpful が必要です" }, { status: 400 });
  }
  const ok = await getQuestionLog().setFeedback(body.questionId, session.sub, body.helpful);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "質問が見つかりません" }, { status: 404 });
}
