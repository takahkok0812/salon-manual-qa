import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "サロンマニュアルQ&A",
  description: "美容室の社内マニュアルに根拠つきで答えるAIチャット（デモ）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
