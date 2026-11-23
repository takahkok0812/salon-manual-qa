/**
 * AWS上のスタック（salon-manual-qa）にサンプルを入れる・状態を見る。
 *   npm run aws:upload   … 用語集 → マニュアル5本の順にS3へ置く（置くと取り込みLambdaが動く）
 *   npm run aws:status   … 取り込まれた区切りの件数を、文書ごとに数える
 * バケット名・表の名前は CloudFormation の出力から取る（アカウントIDなどをリポジトリに書かない）。
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const STACK = process.env.STACK_NAME ?? "salon-manual-qa";

async function outputs(): Promise<Record<string, string>> {
  const res = await new CloudFormationClient({}).send(new DescribeStacksCommand({ StackName: STACK }));
  const out: Record<string, string> = {};
  for (const o of res.Stacks?.[0]?.Outputs ?? []) out[o.OutputKey!] = o.OutputValue!;
  return out;
}

async function upload() {
  const { DocumentsBucketName: bucket } = await outputs();
  const s3 = new S3Client({});
  const put = async (key: string, file: string, type: string) => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: await readFile(file), ContentType: type }));
    console.log(`置いた：s3://${bucket}/${key}`);
  };
  // 用語集を先に置く（マニュアルの取り込み時に読まれるため）
  await put("config/glossary.json", path.join("samples", "glossary.json"), "application/json");
  const dir = path.join("samples", "manuals");
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".md")).sort()) {
    await put(`manuals/${f}`, path.join(dir, f), "text/markdown; charset=utf-8");
  }
}

async function status() {
  const { ChunksTableName: table } = await outputs();
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const counts = new Map<string, { sections: number; lines: number; dims: number }>();
  let key: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: key, ProjectionExpression: "docId, parentId, vector" }));
    for (const it of res.Items ?? []) {
      const c = counts.get(it.docId) ?? { sections: 0, lines: 0, dims: 0 };
      if (it.parentId) c.lines++;
      else c.sections++;
      c.dims = (it.vector as number[] | undefined)?.length ?? 0;
      counts.set(it.docId, c);
    }
    key = res.LastEvaluatedKey;
  } while (key);
  let total = 0;
  for (const [doc, c] of [...counts].sort()) {
    console.log(`${doc}：見出し ${c.sections}・箇条書き ${c.lines}（ベクトル ${c.dims}次元）`);
    total += c.sections + c.lines;
  }
  console.log(`合計 ${total}件（${counts.size}文書）`);
}

const cmd = process.argv[2];
(cmd === "upload" ? upload() : cmd === "status" ? status() : Promise.reject(new Error("upload か status を指定してください"))).catch((e) => {
  console.error(e);
  process.exit(1);
});
