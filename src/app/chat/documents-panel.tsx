"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./live-chat.module.css";

type DocInfo = { name: string; docId: string; chunks: number; status: "done" | "processing" | "failed"; uploadedAt?: string; sample: boolean };

const STATUS_LABEL = { done: "取り込み完了", processing: "処理中", failed: "失敗" } as const;

/** 文書の管理（店長だけ）。アップロードした文書は、その人の質問にだけ使われ、24時間で消える。 */
export function DocumentsPanel() {
  const [items, setItems] = useState<DocInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) setItems(((await res.json()) as { items: DocInfo[] }).items);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/documents")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items: DocInfo[] }) => alive && setItems(j.items));
    return () => {
      alive = false;
    };
  }, []);

  // 処理中の文書があるあいだは5秒ごとに状況を読み直す
  const processing = items?.some((i) => i.status === "processing") ?? false;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [processing, load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, content: await file.text() }),
      });
      if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "アップロードできませんでした");
      await load();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (name: string) => {
    const res = await fetch("/api/documents", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "削除できませんでした");
    await load();
  };

  return (
    <section className={styles.unresolved} aria-label="文書の管理">
      <div className={styles.unresolvedHead}>
        <h2>文書の管理（店長だけ）</h2>
        <button type="button" onClick={load}>
          更新
        </button>
      </div>
      <p>
        Markdown（.md）かテキスト（.txt）をアップロードすると、分割・埋め込みして質問に使えるようになります。デモのため、アップロードした文書はあなたの質問にだけ使われ、24時間で自動的に削除されます。
      </p>
      <label className={styles.upload}>
        <span>文書をアップロード</span>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {items && (
        <table className={styles.docs}>
          <thead>
            <tr>
              <th>文書</th>
              <th>状況</th>
              <th>区切り</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.docId}>
                <td>
                  {d.name}
                  {d.sample && <span className={styles.sampleTag}>サンプル</span>}
                </td>
                <td>
                  <span className={styles[`st_${d.status}`]}>{STATUS_LABEL[d.status]}</span>
                </td>
                <td>{d.chunks}</td>
                <td>
                  {!d.sample && (
                    <button type="button" onClick={() => remove(d.name)} aria-label={`${d.name}を削除`}>
                      削除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
