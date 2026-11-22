import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

/** 文字列をベクトルにする部分の差し替え口。 */
export interface Embedder {
  readonly name: string;
  embed(text: string): Promise<number[]>;
}

export const DEFAULT_EMBED_MODEL_ID = "amazon.titan-embed-text-v2:0";
export const EMBED_DIMENSIONS = 512;

/** Bedrock の Titan Text Embeddings V2。normalize: true なので内積＝コサイン類似度になる。 */
export class BedrockTitanEmbedder implements Embedder {
  readonly name: string;
  private client: BedrockRuntimeClient;

  constructor(
    private modelId = process.env.EMBED_MODEL_ID ?? DEFAULT_EMBED_MODEL_ID,
    client?: BedrockRuntimeClient,
  ) {
    this.name = `bedrock:${modelId}`;
    this.client = client ?? new BedrockRuntimeClient({});
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.client.send(
      new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: text, dimensions: EMBED_DIMENSIONS, normalize: true }),
      }),
    );
    const json = JSON.parse(new TextDecoder().decode(res.body)) as { embedding: number[] };
    return json.embedding;
  }
}

/**
 * テスト用。文字のbigramを数えて固定長のベクトルにする（AWSを呼ばない）。
 * 意味は分からないが、同じ言葉を多く含む文ほど近くなる。
 */
export class BigramEmbedder implements Embedder {
  readonly name = "local:bigram";
  constructor(private dims = 256) {}

  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dims).fill(0);
    const s = text.replace(/\s+/g, "");
    for (let i = 0; i < s.length - 1; i++) {
      v[hash(s.slice(i, i + 2)) % this.dims] += 1;
    }
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** EMBEDDER=local のときはAWSを呼ばない。既定はBedrock。 */
export function createEmbedder(kind = process.env.EMBEDDER ?? "bedrock"): Embedder {
  return kind === "local" ? new BigramEmbedder() : new BedrockTitanEmbedder();
}
