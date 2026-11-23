import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/**
 * 自由な質問（AIを実際に呼ぶ）の1日あたりの回数制限。
 * 日付は日本時間で区切る。
 */
export const DAILY_LIMIT = Number(process.env.DAILY_QUESTION_LIMIT ?? 5);

export interface QuotaStore {
  /** 1回分を使う。上限に達していれば ok: false（回数は増やさない）。 */
  take(user: string, day: string, limit: number): Promise<{ ok: boolean; used: number }>;
}

export function jstDay(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class MemoryQuotaStore implements QuotaStore {
  private counts = new Map<string, number>();
  async take(user: string, day: string, limit: number) {
    const key = `${user}#${day}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= limit) return { ok: false, used };
    this.counts.set(key, used + 1);
    return { ok: true, used: used + 1 };
  }
}

/** 質問ログの表（キー questionId）に quota#ユーザー#日付 の項目を置き、条件付きで1ずつ増やす。 */
export class DynamoQuotaStore implements QuotaStore {
  private ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  constructor(private table: string) {}
  async take(user: string, day: string, limit: number) {
    try {
      const res = await this.ddb.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { questionId: `quota#${user}#${day}` },
          UpdateExpression: "ADD #n :one SET expiresAt = :exp",
          ConditionExpression: "attribute_not_exists(#n) OR #n < :limit",
          ExpressionAttributeNames: { "#n": "count" },
          ExpressionAttributeValues: { ":one": 1, ":limit": limit, ":exp": Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60 },
          ReturnValues: "UPDATED_NEW",
        }),
      );
      return { ok: true, used: Number(res.Attributes?.count ?? 1) };
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return { ok: false, used: limit };
      throw e;
    }
  }
}

let shared: QuotaStore | null = null;
/** QUESTION_LOG_TABLE があれば DynamoDB、なければプロセス内のメモリ（手元で試す用）。 */
export function getQuotaStore(): QuotaStore {
  if (!shared) shared = process.env.QUESTION_LOG_TABLE ? new DynamoQuotaStore(process.env.QUESTION_LOG_TABLE) : new MemoryQuotaStore();
  return shared;
}
