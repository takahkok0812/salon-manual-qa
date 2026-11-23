import { cookies } from "next/headers";
import { getQuestionLog } from "@/lib/question-log";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** 答えられなかった質問と、役に立たなかった回答の一覧（店長だけ）。 */
export async function GET() {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "ログインしてください" }, { status: 401 });
  if (session.role !== "manager") return Response.json({ error: "店長だけが見られます" }, { status: 403 });
  const items = await getQuestionLog().listUnresolved(50);
  return Response.json({
    items: items.map(({ questionId, question, noAnswer, helpful, createdAt, headings }) => ({ questionId, question, noAnswer, helpful, createdAt, headings })),
  });
}
