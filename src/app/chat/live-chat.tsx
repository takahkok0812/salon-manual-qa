"use client";

import { useEffect, useState } from "react";
import { MAX_QUESTION_LENGTH, type AskResult } from "@/lib/demo";
import type { Role } from "@/lib/session";
import { AnswerView } from "../qa-demo";
import { DocumentsPanel } from "./documents-panel";
import { VoiceMemo } from "./voice-memo";
import demoStyles from "../qa-demo.module.css";
import styles from "./live-chat.module.css";

const ROLE_LABEL: Record<Role, string> = { staff: "スタッフ", manager: "店長" };

type Entry = AskResult & { id: string; questionId: string; feedback?: boolean };
type Unresolved = { questionId: string; question: string; noAnswer: boolean; helpful?: boolean; createdAt: string };

export function LiveChat() {
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState<Unresolved[] | null>(null);

  const loadUnresolved = async () => {
    const res = await fetch("/api/unresolved");
    if (res.ok) setUnresolved(((await res.json()) as { items: Unresolved[] }).items);
  };

  const sendFeedback = async (entry: Entry, helpful: boolean) => {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: entry.questionId, helpful }),
    });
    if (res.ok) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, feedback: helpful } : e)));
      if (role === "manager") loadUnresolved();
    }
  };

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((j: { role: Role | null }) => {
        setRole(j.role);
        if (j.role === "manager") loadUnresolved();
      })
      .catch(() => setRole(null));
  }, []);

  const login = async (r: Role) => {
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: r }) });
    if (res.ok) {
      setRole(r);
      if (r === "manager") loadUnresolved();
    }
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
      setEntries((prev) => [{ ...(j as AskResult & { questionId: string }), id: `live-${Date.now()}` }, ...prev]);
      setRemaining(j.remaining);
      setQuestion("");
      if (role === "manager") loadUnresolved();
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
            <div className={styles.feedback} role="group" aria-label="この回答の評価">
              {e.feedback === undefined ? (
                <>
                  <span>この回答は</span>
                  <button type="button" onClick={() => sendFeedback(e, true)}>
                    役に立った
                  </button>
                  <button type="button" onClick={() => sendFeedback(e, false)}>
                    役に立たなかった
                  </button>
                </>
              ) : (
                <span>評価を記録しました（{e.feedback ? "役に立った" : "役に立たなかった"}）</span>
              )}
            </div>
          </div>
        ))}
      </section>

      <VoiceMemo onRemaining={setRemaining} />

      {role === "manager" && <DocumentsPanel />}

      {role === "manager" && (
        <section className={styles.unresolved} aria-label="答えられなかった質問">
          <div className={styles.unresolvedHead}>
            <h2>答えられなかった質問（店長だけ）</h2>
            <button type="button" onClick={loadUnresolved}>
              更新
            </button>
          </div>
          <p>「記載なし」になった質問と「役に立たなかった」がついた回答です。マニュアルに足すべきことの候補になります。</p>
          {unresolved === null ? null : unresolved.length === 0 ? (
            <p className={demoStyles.empty}>まだありません。</p>
          ) : (
            <ul>
              {unresolved.map((u) => (
                <li key={u.questionId}>
                  <span className={styles.tag}>{u.noAnswer ? "記載なし" : "役に立たなかった"}</span>
                  {u.question}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
