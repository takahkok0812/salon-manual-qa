import demo from "@/data/demo-answers.json";
import type { DemoData } from "@/lib/demo";
import { getSampleSummary } from "@/lib/samples";
import styles from "./page.module.css";
import { QaDemo } from "./qa-demo";

const REPO_URL = "https://github.com/takahkok0812/salon-manual-qa";

export default async function Home() {
  const { docTitles, chunkCount } = await getSampleSummary();
  const data = demo as DemoData;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>架空の美容室チェーン「みどり坂ヘア」の社内マニュアル</p>
        <h1>サロンマニュアルQ&amp;A</h1>
        <p className={styles.lead}>
          スタッフの質問に、マニュアルの該当箇所を根拠として示しながら答えるAIチャットのデモです。
          マニュアルに書かれていないことは、推測せずに「記載なし」と答えます。
        </p>
      </header>

      <QaDemo data={data} />

      <section className={styles.about}>
        <h2>このデモのしくみ</h2>
        <ul>
          <li>
            マニュアル{docTitles.length}本を見出しと箇条書きの単位に分け（{chunkCount}区切り）、Amazon Bedrock の埋め込みモデルで検索できるようにしています。
          </li>
          <li>質問に近い区切りを3件選び、それだけを根拠としてAIに回答させます。回答の [1] などは根拠の番号です。</li>
          <li>
            「記載なし」は2段階で判断します。マニュアルと明らかに離れた質問はAIを呼ばずに返し、それ以外は根拠を見たAIが判断します。
          </li>
          <li>評価用の質問27問（マニュアルにない質問10問を含む）で、検索と回答の精度を測りながら作りました。</li>
        </ul>
        {data.generatedAt && (
          <p className={styles.meta}>
            回答の作成：{new Date(data.generatedAt).toLocaleDateString("ja-JP")}（回答モデル {data.answerModel.replace(/^bedrock:/, "")}）
          </p>
        )}
        <p>
          <a className={styles.link} href={REPO_URL}>
            ソースコードと評価の結果（GitHub）
          </a>
        </p>
      </section>
    </main>
  );
}
