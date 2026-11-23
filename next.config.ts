import type { NextConfig } from "next";

/**
 * GITHUB_PAGES=1 のときは静的ファイルに書き出す（公開デモを GitHub Pages で配信する）。
 * 公開デモはAIを呼ばず、事前に作った回答を表示するだけなので、サーバーなしで動く。
 * ログインやAIを呼ぶ画面・APIは *.live.ts(x) という名前にして、静的書き出しのときはルートに含めない。
 * 静的書き出しでは Cache Components（Partial Prerendering）を使えないため、両方の構成で使っていない。
 */
const isPages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = isPages
  ? { output: "export", basePath: "/salon-manual-qa", images: { unoptimized: true } }
  : { pageExtensions: ["live.tsx", "live.ts", "tsx", "ts"] };

export default nextConfig;
