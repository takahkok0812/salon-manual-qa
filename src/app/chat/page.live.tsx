import Link from "next/link";
import styles from "../page.module.css";
import { LiveChat } from "./live-chat";

export const metadata = { title: "自由に質問 | サロンマニュアルQ&A" };

export default function ChatPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>ログインした人だけが使える画面</p>
        <h1>自由に質問</h1>
        <p className={styles.lead}>
          マニュアルの内容について自由に質問できます。この画面では実際にAIが答えるため、1日の回数に上限があります。
        </p>
      </header>
      <LiveChat />
      <p>
        <Link className={styles.link} href="/">
          用意した質問のデモに戻る
        </Link>
      </p>
    </main>
  );
}
