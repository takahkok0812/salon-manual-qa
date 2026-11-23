import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * デモ用のログイン（スタッフ／店長の2ロール）。
 * HS256 の JWT を HttpOnly Cookie に入れる。署名鍵は SESSION_SECRET（未設定なら開発用の固定値）。
 */
export type Role = "staff" | "manager";
export type Session = { sub: string; role: Role; exp: number };

export const SESSION_COOKIE = "smqa_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24;
const DEV_SECRET = "dev-only-secret-change-me";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SECRET !== "1") {
    throw new Error("SESSION_SECRET が設定されていません");
  }
  return s ?? DEV_SECRET;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

export function createSession(role: Role, now = Date.now(), key = secret()): { token: string; session: Session } {
  const session: Session = { sub: `demo-${role}-${randomUUID().slice(0, 8)}`, role, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(session));
  return { token: `${head}.${body}.${sign(`${head}.${body}`, key)}`, session };
}

/** 署名・アルゴリズム・期限・ロールを確かめる。だめなら null。 */
export function verifySession(token: string | undefined, now = Date.now(), key = secret()): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const expected = Buffer.from(sign(`${head}.${body}`, key));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (s.role !== "staff" && s.role !== "manager") return null;
    if (typeof s.exp !== "number" || s.exp * 1000 <= now) return null;
    return s;
  } catch {
    return null;
  }
}
