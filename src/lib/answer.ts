import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { buildUserPrompt, NO_ANSWER, SYSTEM_PROMPT } from "./prompt";
import { hasEvidence, type Hit } from "./search";
import { fakeGenerate } from "./summarize";

/** 回答を作る部分の差し替え口。Bedrock（Claude・Nova）とClaude APIの直接呼び出しを切り替えられる。 */
export interface Answerer {
  readonly name: string;
  answer(question: string, hits: Hit[]): Promise<string>;
  /** 指示（system）と入力を渡して文章を作る。音声メモの要約などで使う。 */
  generate(system: string, user: string): Promise<string>;
}

const MAX_TOKENS = 400;
const GENERATE_MAX_TOKENS = 800;

/** Bedrock の Converse API。Claude でも Nova でも同じ呼び方で使える。 */
export class BedrockAnswerer implements Answerer {
  readonly name: string;
  private client: BedrockRuntimeClient;

  constructor(private modelId: string, client?: BedrockRuntimeClient) {
    this.name = `bedrock:${modelId}`;
    this.client = client ?? new BedrockRuntimeClient({});
  }

  async answer(question: string, hits: Hit[]): Promise<string> {
    return this.converse(SYSTEM_PROMPT, buildUserPrompt(question, hits), MAX_TOKENS);
  }

  async generate(system: string, user: string): Promise<string> {
    return this.converse(system, user, GENERATE_MAX_TOKENS);
  }

  private async converse(system: string, user: string, maxTokens: number): Promise<string> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens, temperature: 0 },
      }),
    );
    const blocks = res.output?.message?.content ?? [];
    return blocks.map((b) => ("text" in b ? b.text : "")).join("").trim();
  }
}

/** Claude API を直接呼ぶ（ANTHROPIC_API_KEY が必要）。 */
export class AnthropicAnswerer implements Answerer {
  readonly name: string;

  constructor(
    private model: string,
    private apiKey = process.env.ANTHROPIC_API_KEY,
  ) {
    this.name = `anthropic:${model}`;
  }

  async answer(question: string, hits: Hit[]): Promise<string> {
    return this.messages(SYSTEM_PROMPT, buildUserPrompt(question, hits), MAX_TOKENS);
  }

  async generate(system: string, user: string): Promise<string> {
    return this.messages(system, user, GENERATE_MAX_TOKENS);
  }

  private async messages(system: string, user: string, maxTokens: number): Promise<string> {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API エラー: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    return json.content.map((c) => c.text ?? "").join("").trim();
  }
}

/**
 * テスト・手元確認用。AIを呼ばず、1件目の根拠の1行目を番号つきで返す。
 * E2Eテストや、AWSにつながない状態で画面の流れを確かめるときに使う（ANSWER_PROVIDER=fake）。
 */
export class FakeAnswerer implements Answerer {
  readonly name = "fake";
  async answer(_question: string, hits: Hit[]): Promise<string> {
    const first = hits[0]?.chunk.text.split("\n").find((l) => l.trim()) ?? "";
    return first ? `${first.replace(/^[-\d.\s]+/, "")} [1]` : NO_ANSWER;
  }

  async generate(system: string, user: string): Promise<string> {
    return fakeGenerate(system, user);
  }
}

/** ANSWER_PROVIDER（bedrock | anthropic | fake）と ANSWER_MODEL_ID から作る。 */
export function createAnswerer(
  provider = process.env.ANSWER_PROVIDER ?? "bedrock",
  modelId = process.env.ANSWER_MODEL_ID,
): Answerer {
  if (provider === "fake") return new FakeAnswerer();
  if (!modelId) throw new Error("ANSWER_MODEL_ID が設定されていません（npm run models で使えるIDを確認）");
  return provider === "anthropic" ? new AnthropicAnswerer(modelId) : new BedrockAnswerer(modelId);
}

/** 根拠がなければAIを呼ばずに決まり文句を返す（費用も抑えられる）。 */
export async function answerWithEvidence(
  answerer: Answerer,
  question: string,
  hits: Hit[],
  threshold: number,
): Promise<{ text: string; answered: boolean }> {
  if (!hasEvidence(hits, threshold)) return { text: NO_ANSWER, answered: false };
  return { text: await answerer.answer(question, hits), answered: true };
}
