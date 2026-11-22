import { getSampleSummary } from "@/lib/samples";

export default async function Home() {
  const { docTitles: docs, chunkCount } = await getSampleSummary();

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px", lineHeight: 1.7 }}>
      <h1>サロンマニュアルQ&A</h1>
      <p>
        美容室の社内マニュアルに、根拠を示して答えるAIチャットのデモです。マニュアルにないことは「記載なし」と答えます。
      </p>
      <h2>取り込み対象のマニュアル（サンプル）</h2>
      <ul>
        {docs.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p>分割した区切りの数：{chunkCount}</p>
      <p style={{ color: "#666" }}>チャット画面は次の週末に作ります（仕様書のスケジュール参照）。</p>
    </main>
  );
}
