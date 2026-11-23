"use client";

import { useState } from "react";
import { citedNumbers, splitCitations, type DemoAnswer, type DemoData } from "@/lib/demo";
import styles from "./qa-demo.module.css";

/** 最初に並べる質問の数（残りは「ほかの質問」で開く） */
const FIRST_ANSWERABLE = 6;
const FIRST_NO_ANSWER = 3;

export function QaDemo({ data }: { data: DemoData }) {
  const answerable = data.items.filter((i) => i.kind === "answerable");
  const noAnswer = data.items.filter((i) => i.kind === "no_answer");
  const [selectedId, setSelectedId] = useState<string | null>(data.items[0]?.id ?? null);
  const [showAll, setShowAll] = useState(false);
  const selected = data.items.find((i) => i.id === selectedId) ?? null;

  if (data.items.length === 0) {
    return <p className={styles.empty}>デモ用の回答を準備中です。</p>;
  }

  const visible = (list: DemoAnswer[], first: number) => (showAll ? list : list.slice(0, first));

  return (
    <div className={styles.layout}>
      <nav className={styles.questions} aria-label="質問を選ぶ">
        <QuestionGroup title="マニュアルに答えがある質問" items={visible(answerable, FIRST_ANSWERABLE)} selectedId={selectedId} onSelect={setSelectedId} />
        <QuestionGroup title="マニュアルにない質問" items={visible(noAnswer, FIRST_NO_ANSWER)} selectedId={selectedId} onSelect={setSelectedId} />
        {(answerable.length > FIRST_ANSWERABLE || noAnswer.length > FIRST_NO_ANSWER) && (
          <button type="button" className={styles.more} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "質問を減らす" : `ほかの質問も見る（全${data.items.length}問）`}
          </button>
        )}
        <div className={styles.freeInput}>
          <input type="text" disabled placeholder="自由に質問する" aria-label="自由に質問する（公開デモでは使えません）" />
          <p>公開デモはAIを呼ばず、用意した質問の回答を表示します（費用0円）。自由な質問は、ログインした人だけが使えるようにする予定です。</p>
        </div>
      </nav>

      <section className={styles.chat} aria-live="polite" aria-label="回答">
        {selected ? <AnswerView key={selected.id} item={selected} /> : <p className={styles.empty}>左の一覧から質問を選んでください。</p>}
      </section>
    </div>
  );
}

function QuestionGroup({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: DemoAnswer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.group}>
      <h3>{title}</h3>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" aria-pressed={i.id === selectedId} className={styles.question} onClick={() => onSelect(i.id)}>
              {i.question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerView({ item }: { item: DemoAnswer }) {
  const [active, setActive] = useState<number | null>(null);
  const cited = citedNumbers(item.answer, item.sources.length);
  const shown = item.sources.filter((s) => cited.includes(s.n));

  return (
    <>
      <p className={styles.userBubble}>{item.question}</p>

      {item.noAnswer ? (
        <div className={`${styles.answer} ${styles.noAnswer}`}>
          <span className={styles.badge}>マニュアルに記載なし</span>
          <p>{item.answer}</p>
          <p className={styles.how}>
            {item.decidedBy === "filter"
              ? "判断：マニュアルの内容と離れた質問だったため、AIを呼ばずに「記載なし」と返しました。"
              : "判断：近い内容の区切りを根拠としてAIに渡しましたが、答えが書かれていなかったため「記載なし」と答えました。"}
          </p>
        </div>
      ) : (
        <div className={styles.answer}>
          <p className={styles.answerText}>
            {splitCitations(item.answer, item.sources.length).map((p, i) =>
              p.kind === "text" ? (
                <span key={i}>{p.text}</span>
              ) : (
                <a
                  key={i}
                  href={`#source-${item.id}-${p.n}`}
                  className={styles.cite}
                  aria-label={`根拠${p.n}`}
                  onMouseEnter={() => setActive(p.n)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(p.n)}
                  onBlur={() => setActive(null)}
                >
                  {p.n}
                </a>
              ),
            )}
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className={styles.sources}>
          <h3>根拠にしたマニュアル</h3>
          <ol>
            {shown.map((s) => (
              <li key={s.n} id={`source-${item.id}-${s.n}`} className={s.n === active ? styles.sourceActive : styles.source}>
                <p className={styles.sourceTitle}>
                  <span className={styles.citeStatic}>{s.n}</span>
                  {s.docTitle} ／ {s.heading}
                </p>
                <p className={styles.sourceText}>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
