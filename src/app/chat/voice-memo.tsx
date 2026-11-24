"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_MEMO_LENGTH, NOT_MENTIONED, type SummaryResult } from "@/lib/summarize";
import styles from "./live-chat.module.css";

/** ブラウザの音声認識（Chrome などの webkitSpeechRecognition）。型は使う分だけ定義する。 */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

const SAMPLE =
  "今日は肩につくくらいまで短くしたいです。毛先の傷みが気になっています。前回のカラーで少し頭皮がしみました。今日はカットとトリートメントにします。次回は1か月後にカラーを相談したいです。";

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceMemo({ onRemaining }: { onRemaining: (n: number) => void }) {
  const [memo, setMemo] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [focus, setFocus] = useState<number[]>([]);
  const recRef = useRef<Recognition | null>(null);

  // 音声認識の有無はブラウザでしか分からないので、表示後に確かめる
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getRecognition() !== null);
    return () => recRef.current?.stop();
  }, []);

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text) setMemo((prev) => (prev + (prev && !/[。！？\n]$/.test(prev) ? "。" : "") + text).slice(0, MAX_MEMO_LENGTH));
    };
    rec.onerror = (e) => setError(e.error === "not-allowed" ? "マイクの使用が許可されていません。ブラウザの設定を確認するか、文字で入力してください" : "音声を認識できませんでした");
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    rec.start();
    setListening(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !memo.trim()) return;
    recRef.current?.stop();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/summarize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memo }) });
      const j = await res.json();
      if (typeof j.remaining === "number") onRemaining(j.remaining);
      if (!res.ok) {
        setError(j.error ?? "要約を作れませんでした");
        return;
      }
      setResult({ sentences: j.sentences, fields: j.fields });
      setFocus([]);
    } catch {
      setError("通信に失敗しました。時間をおいて試してください");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.memo} aria-label="音声メモの要約">
      <h2>音声メモをカウンセリング記録に（試作）</h2>
      <p>
        カウンセリングで聞いたことを話すかメモすると、AIが5つの項目にまとめます。各項目には、もとになった文の番号が付きます。話に出てこなかった項目は推測せず「{NOT_MENTIONED}」にします。
      </p>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="voice-memo" className={styles.label}>
          メモ
        </label>
        <textarea id="voice-memo" value={memo} maxLength={MAX_MEMO_LENGTH} rows={4} onChange={(e) => setMemo(e.target.value)} placeholder="例：今日は肩につくくらいまで短くしたいです。" />
        <div className={styles.formFoot}>
          <span className={styles.memoTools}>
            {supported ? (
              <button type="button" className={styles.secondary} onClick={toggleMic} aria-pressed={listening}>
                {listening ? "録音を止める" : "話して入力"}
              </button>
            ) : (
              <span>このブラウザは音声入力に対応していません（文字で入力できます）</span>
            )}
            <button type="button" className={styles.secondary} onClick={() => setMemo(SAMPLE)}>
              例文を入れる
            </button>
            <span>
              {memo.length}/{MAX_MEMO_LENGTH}
            </span>
          </span>
          <button type="submit" disabled={busy || !memo.trim()}>
            {busy ? "まとめています…" : "記録にまとめる"}
          </button>
        </div>
        {listening && <p className={styles.recording}>録音中…（話し終えたら「録音を止める」）</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <p className={styles.note}>音声の文字起こしはブラウザの機能を使います（Chrome では Google の音声認識）。AIに送るのは文字だけです。</p>
      </form>

      {result && (
        <div className={styles.summary} aria-label="カウンセリング記録" role="region">
          <dl>
            {result.fields.map((f) => (
              <div key={f.label} className={f.text === NOT_MENTIONED ? styles.notMentioned : undefined}>
                <dt>{f.label}</dt>
                <dd>
                  {f.text}
                  {f.sources.map((n) => (
                    <button key={n} type="button" className={styles.cite} aria-label={`もとの文${n}`} onClick={() => setFocus(f.sources)}>
                      {n}
                    </button>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <h3>もとのメモ</h3>
          <ol className={styles.sentences}>
            {result.sentences.map((s, i) => (
              <li key={i} className={focus.includes(i + 1) ? styles.focused : undefined}>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
