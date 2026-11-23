import { cookies } from "next/headers";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, verifySession, type Role } from "@/lib/session";

/** 今のログイン状態（ロール）を返す。 */
export async function GET() {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return Response.json({ role: session?.role ?? null });
}

/** デモ用アカウントでログインする（{ role: "staff" | "manager" }）。 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { role?: string };
  if (body.role !== "staff" && body.role !== "manager") {
    return Response.json({ error: "role は staff か manager です" }, { status: 400 });
  }
  const { token } = createSession(body.role as Role);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return Response.json({ role: body.role });
}

/** ログアウト。 */
export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ role: null });
}
