export type Chunk = {
  /** 文書ファイル名（例: 01_予約・受付.md） */
  docId: string;
  /** 文書のタイトル（# 見出し） */
  docTitle: string;
  /** 区切りの見出し（## 見出し） */
  heading: string;
  /** 本文（見出しを除く） */
  text: string;
  /** docId と heading から作る一意なID */
  chunkId: string;
};

/**
 * Markdownの文書を「## 見出し」ごとに分割する。
 * 冒頭の注記（> で始まる行）は検索の邪魔になるので本文から外す。
 * 1つの区切りが maxChars を超える場合は、段落の切れ目でさらに分ける。
 */
export function splitMarkdown(docId: string, markdown: string, maxChars = 800): Chunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.find((l) => l.startsWith("# "));
  const docTitle = titleLine ? titleLine.slice(2).trim() : docId;

  const sections: { heading: string; body: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) {
      sections.push({ heading: line.slice(3).trim(), body: [] });
    } else if (sections.length > 0 && !line.startsWith("> ")) {
      sections.at(-1)!.body.push(line);
    }
  }

  const chunks: Chunk[] = [];
  for (const s of sections) {
    const text = s.body.join("\n").trim();
    if (!text) continue;
    const parts = splitByLength(text, maxChars);
    parts.forEach((part, i) => {
      const suffix = parts.length > 1 ? `#${i + 1}` : "";
      chunks.push({
        docId,
        docTitle,
        heading: s.heading,
        text: part,
        chunkId: `${docId}::${s.heading}${suffix}`,
      });
    });
  }
  return chunks;
}

function splitByLength(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const out: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > maxChars) {
      out.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) out.push(current);
  return out;
}

/** 埋め込みに渡す文字列。見出しを先頭に付けて、短い区切りでも意味が伝わるようにする。 */
export function toEmbeddingInput(chunk: Chunk): string {
  return `${chunk.docTitle} / ${chunk.heading}\n${chunk.text}`;
}
