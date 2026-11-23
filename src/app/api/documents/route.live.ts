import { cookies } from "next/headers";
import { getDocumentStore } from "@/lib/documents";
import { validateUpload } from "@/lib/ingest";
import { getQuotaStore, jstDay } from "@/lib/quota";
import { SESSION_COOKIE, verifySession, type Session } from "@/lib/session";

/** アップロードの回数制限（1人1日3件・全体で1日20件）。デモ用ログインは誰でも入れるため */
const UPLOADS_PER_USER = Number(process.env.DAILY_UPLOAD_LIMIT ?? 3);
const UPLOADS_GLOBAL = Number(process.env.GLOBAL_DAILY_UPLOAD_LIMIT ?? 20);

async function manager(): Promise<Session | Response> {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return Response.json({ error: "ログインしてください" }, { status: 401 });
  if (session.role !== "manager") return Response.json({ error: "店長だけが使えます" }, { status: 403 });
  return session;
}

/** 文書の一覧と取り込み状況（サンプル＋自分がアップロードしたもの）。 */
export async function GET() {
  const s = await manager();
  if (s instanceof Response) return s;
  return Response.json({ items: await getDocumentStore().list(s.sub) });
}

/** 文書をアップロードする（{ name, content }）。その人の質問にだけ使い、24時間で消える。 */
export async function POST(request: Request) {
  const s = await manager();
  if (s instanceof Response) return s;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; content?: unknown };
  const v = validateUpload(body.name, body.content);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const day = jstDay();
  const quota = getQuotaStore();
  if (!(await quota.take(`upload#${s.sub}`, day, UPLOADS_PER_USER)).ok) {
    return Response.json({ error: `アップロードは1日${UPLOADS_PER_USER}件までです` }, { status: 429 });
  }
  if (!(await quota.take("upload#__all__", day, UPLOADS_GLOBAL)).ok) {
    return Response.json({ error: "デモ全体の今日のアップロード数が上限に達しました" }, { status: 429 });
  }
  await getDocumentStore().upload(s.sub, v.name, v.content);
  return Response.json({ ok: true });
}

/** 自分がアップロードした文書を消す（{ name }）。サンプルは消せない。 */
export async function DELETE(request: Request) {
  const s = await manager();
  if (s instanceof Response) return s;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  if (typeof body.name !== "string" || !body.name) return Response.json({ error: "name が必要です" }, { status: 400 });
  const ok = await getDocumentStore().remove(s.sub, body.name);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "文書が見つかりません" }, { status: 404 });
}
