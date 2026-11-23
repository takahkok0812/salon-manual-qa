"use client";

import { useEffect, useState } from "react";
import { MAX_QUESTION_LENGTH, type AskResult } from "@/lib/demo";
import type { Role } from "@/lib/session";
import { AnswerView } from "../qa-demo";
import demoStyles from "../qa-demo.module.css";
import styles from "./live-chat.module.css";

const ROLE_LABEL: Record<Role, string> = { staff: "スタッフ", manager: "店長" };

type Entry = AskResult & { id: string };

export function LiveChat() {
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((j: { role: Role | null }) => setRole(j.role))
      .catch(() => setRole(null));
  }, []);

  const login = async (r: Role) => {
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: r }) });
    if (res.ok) setRole(r);
  };

  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setRole(null);
    setEntries([]);
    setRemaining(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "回答できませんでした");
        if (typeof j.remaining === "number") setRemaining(j.remaining);
        if (res.status === 401) setRole(null);
        return;
      }
      setEntries((prev) => [{ ...(j as AskResult), id: `live-${Date.now()}` }, ...prev]);
      setRemaining(j.remaining);
      setQuestion("");
    } catch {
      setError("通信に失敗しました。時間をおいて試してください");
    } finally {
      setBusy(false);
    }
  };

  if (role === undefined) return <p className={demoStyles.empty}>読み込み中…</p>;

  if (role === null) {
    return (
      <section className={styles.login} aria-label="ログイン">
        <p>デモ用のアカウントで入れます（パスワードは不要です）。</p>
        <div className={styles.loginButtons}>
          <button type="button" onClick={() => login("staff")}>
            スタッフで入る
          </button>
          <button type="button" onClick={() => login("manager")}>
            店長で入る
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.chat}>
      <div className={styles.status}>
        <span>{ROLE_LABEL[role]}としてログイン中</span>
        {remaining !== null && <span>今日あと{remaining}回</span>}
        <button type="button" className={styles.logout} onClick={logout}>
          ログアウト
        </button>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="live-question" className={styles.label}>
          質問
        </label>
        <textarea
          id="live-question"
          value={question}
          maxLength={MAX_QUESTION_LENGTH}
          rows={3}
          placeholder="例：カラー剤の在庫が切れたらどうする？"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className={styles.formFoot}>
          <span>
            {question.length}/{MAX_QUESTION_LENGTH}
          </span>
          <button type="submit" disabled={busy || !question.trim()}>
            {busy ? "回答を作成中…" : "質問する"}
          </button>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </form>

      <section className={styles.entries} aria-live="polite" aria-label="回答">
        {entries.map((e) => (
          <div key={e.id} className={demoStyles.chat} style={{ position: "static" }}>
            <AnswerView item={e} />
          </div>
        ))}
      </section>
    </section>
  );
}
