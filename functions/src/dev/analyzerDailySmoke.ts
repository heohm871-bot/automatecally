import { db } from "../lib/admin";
import { analyzerDaily } from "../handlers/tasks/analyzerDaily";
import type { TaskBase } from "../handlers/schema";

async function seedMetrics(siteId: string, runDate: string) {
  const now = new Date(`${runDate}T09:00:00.000Z`);
  const before8d = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

  await db().collection("postMetrics").add({
    siteId,
    keyword: "키워드-a",
    clusterId: "cluster-a",
    templateId: "template-a",
    pv_24h: 180,
    pv_72h: 420,
    comments: 7,
    likes: 24,
    score: 0.44,
    createdAt: now
  });
  await db().collection("postMetrics").add({
    siteId,
    keyword: "키워드-b",
    clusterId: "cluster-b",
    templateId: "template-b",
    pv_24h: 130,
    pv_72h: 350,
    comments: 4,
    likes: 16,
    score: 0.36,
    createdAt: now
  });
  await db().collection("postMetrics").add({
    siteId,
    keyword: "old-keyword",
    clusterId: "cluster-a",
    templateId: "template-a",
    pv_24h: 90,
    pv_72h: 190,
    comments: 2,
    likes: 8,
    score: 0.2,
    createdAt: before8d
  });
}

async function run() {
  const siteId = process.env.ANALYZER_SITE_ID ?? "site-naver-life";
  const runDate = process.env.ANALYZER_RUN_DATE ?? new Date().toISOString().slice(0, 10);
  await seedMetrics(siteId, runDate);

  const payload: TaskBase = {
    schemaVersion: "1.0",
    taskType: "analyzer_daily",
    siteId,
    traceId: `trace-analyzer-${Date.now()}`,
    idempotencyKey: `analyzer_daily:${siteId}:${runDate}`,
    createdAt: new Date().toISOString(),
    requestedByUid: "DEV",
    retryCount: 0,
    runDate
  };

  await analyzerDaily(payload);
  const docId = `${siteId}_${runDate}`;
  const snap = await db().doc(`siteMetricsDaily/${docId}`).get();
  console.log(JSON.stringify({ ok: true, docId, data: snap.data() ?? null }, null, 2));
}

run().catch((err: unknown) => {
  console.error(String((err as { message?: string })?.message ?? err));
  process.exit(1);
});
