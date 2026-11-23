import { randomUUID } from "node:crypto";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Role } from "./session";

/**
 * 質問ログ。店長が「答えられなかった質問」「役に立たなかった回答」を見て、マニュアルに足すべきことを知るために使う。
 * 90日で自動的に消える（DynamoDB の TTL）。
 */
export type QuestionRecord = {
  questionId: string;
  user: string;
  role: Role;
  question: string;
  noAnswer: boolean;
  decidedBy: "filter" | "ai";
  headings: string[];
  createdAt: string;
  helpful?: boolean;
};

export const LOG_TTL_DAYS = 90;

export interface QuestionLogStore {
  add(r: Omit<QuestionRecord, "questionId" | "createdAt">): Promise<QuestionRecord>;
  /** 本人の質問にだけ評価をつけられる。見つからない・本人でなければ false。 */
  setFeedback(questionId: string, user: string, helpful: boolean): Promise<boolean>;
  /** 答えられなかった質問と、役に立たなかった回答（新しい順）。 */
  listUnresolved(limit: number): Promise<QuestionRecord[]>;
}

const isUnresolved = (r: QuestionRecord) => r.noAnswer || r.helpful === false;
const newest = (a: QuestionRecord, b: QuestionRecord) => b.createdAt.localeCompare(a.createdAt);

export class MemoryQuestionLog implements QuestionLogStore {
  private items = new Map<string, QuestionRecord>();
  async add(r: Omit<QuestionRecord, "questionId" | "createdAt">) {
    const rec = { ...r, questionId: `q#${randomUUID()}`, createdAt: new Date().toISOString() };
    this.items.set(rec.questionId, rec);
    return rec;
  }
  async setFeedback(questionId: string, user: string, helpful: boolean) {
    const r = this.items.get(questionId);
    if (!r || r.user !== user) return false;
    r.helpful = helpful;
    return true;
  }
  async listUnresolved(limit: number) {
    return [...this.items.values()].filter(isUnresolved).sort(newest).slice(0, limit);
  }
}

export class DynamoQuestionLog implements QuestionLogStore {
  private ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  constructor(private table: string) {}

  async add(r: Omit<QuestionRecord, "questionId" | "createdAt">) {
    const rec: QuestionRecord = { ...r, questionId: `q#${randomUUID()}`, createdAt: new Date().toISOString() };
    const expiresAt = Math.floor(Date.now() / 1000) + LOG_TTL_DAYS * 24 * 60 * 60;
    await this.ddb.send(new PutCommand({ TableName: this.table, Item: { ...rec, expiresAt } }));
    return rec;
  }

  async setFeedback(questionId: string, user: string, helpful: boolean) {
    try {
      await this.ddb.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { questionId },
          UpdateExpression: "SET helpful = :h",
          ConditionExpression: "attribute_exists(questionId) AND #u = :u",
          ExpressionAttributeNames: { "#u": "user" },
          ExpressionAttributeValues: { ":h": helpful, ":u": user },
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }

  async listUnresolved(limit: number) {
    // デモの規模（多くて数百件）なので Scan で足りる。件数が増えたら日付のGSIを足す
    const out: QuestionRecord[] = [];
    let key: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(
        new ScanCommand({
          TableName: this.table,
          ExclusiveStartKey: key,
          FilterExpression: "begins_with(questionId, :p) AND (noAnswer = :t OR helpful = :f)",
          ExpressionAttributeValues: { ":p": "q#", ":t": true, ":f": false },
        }),
      );
      out.push(...((res.Items ?? []) as QuestionRecord[]));
      key = res.LastEvaluatedKey;
    } while (key);
    return out.sort(newest).slice(0, limit);
  }
}

let shared: QuestionLogStore | null = null;
/** QUESTION_LOG_TABLE があれば DynamoDB、なければプロセス内のメモリ（手元で試す用）。 */
export function getQuestionLog(): QuestionLogStore {
  if (!shared) shared = process.env.QUESTION_LOG_TABLE ? new DynamoQuestionLog(process.env.QUESTION_LOG_TABLE) : new MemoryQuestionLog();
  return shared;
}
