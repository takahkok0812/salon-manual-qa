/**
 * 取り込み用Lambda：S3にマニュアルが置かれたら、分割→埋め込み→DynamoDBに保存する。
 * 雛形の段階。AWS上での動作確認は週末1（11/28・29）に行う。
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { S3Event } from "aws-lambda";
import { splitMarkdown, toEmbeddingInput } from "../../src/lib/chunk";
import { BedrockTitanEmbedder } from "../../src/lib/embed";

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TABLE = process.env.CHUNKS_TABLE!;
const embedder = new BedrockTitanEmbedder();

export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    if (!key.endsWith(".md") && !key.endsWith(".txt")) continue;

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await obj.Body!.transformToString("utf-8");
    const docId = key.split("/").at(-1)!;
    const chunks = splitMarkdown(docId, body);

    const items = [];
    for (const c of chunks) {
      items.push({ ...c, vector: await embedder.embed(toEmbeddingInput(c)), updatedAt: new Date().toISOString() });
    }

    // BatchWrite は25件ずつ
    for (let i = 0; i < items.length; i += 25) {
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) },
        }),
      );
    }
    console.log(JSON.stringify({ msg: "ingested", docId, chunks: items.length }));
  }
}
