import { db } from "../../lib/admin";
import type { TaskBase } from "../schema";

type MetricRow = {
  siteId?: string;
  clusterId?: string;
  templateId?: string;
  pv_24h?: number;
  pv_72h?: number;
  comments?: number;
  likes?: number;
  score?: number;
  createdAt?: unknown;
};

type ArticleRow = {
  siteId?: string;
  clusterId?: string;
  status?: string;
  qa?: { pass?: boolean };
  titleSimMax?: number;
  createdAt?: unknown;
};

function toMillis(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toDate === "function") {
      try {
        return (obj.toDate as () => Date)().getTime();
      } catch {
        return 0;
      }
    }
    if (typeof obj.seconds === "number") return obj.seconds * 1000;
    if (typeof obj._seconds === "number") return obj._seconds * 1000;
  }
  return 0;
}

function avg(rows: MetricRow[], key: keyof MetricRow) {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((s, row) => s + (typeof row[key] === "number" ? Number(row[key]) : 0), 0);
  return sum / rows.length;
}

function windowRows(rows: MetricRow[], startMs: number, endMs: number) {
  return rows.filter((r) => {
    const ms = toMillis(r.createdAt);
    return ms >= startMs && ms < endMs;
  });
}

function windowByCreatedAt<T extends { createdAt?: unknown }>(rows: T[], startMs: number, endMs: number) {
  return rows.filter((r) => {
    const ms = toMillis(r.createdAt);
    return ms >= startMs && ms < endMs;
  });
}

export async function analyzerDaily(payload: TaskBase) {
  const runStartMs = Date.parse(`${payload.runDate}T00:00:00.000Z`);
  const runEndMs = runStartMs + 24 * 60 * 60 * 1000;
  const curr7StartMs = runStartMs - 6 * 24 * 60 * 60 * 1000;
  const prev7StartMs = runStartMs - 13 * 24 * 60 * 60 * 1000;
  const prev7EndMs = runStartMs - 6 * 24 * 60 * 60 * 1000;

  const snap = await db().collection("postMetrics").where("siteId", "==", payload.siteId).limit(2000).get();
  const rows = snap.docs.map((d) => d.data() as MetricRow);

  const dayRows = windowRows(rows, runStartMs, runEndMs);
  const curr7Rows = windowRows(rows, curr7StartMs, runEndMs);
  const prev7Rows = windowRows(rows, prev7StartMs, prev7EndMs);

  const prevAvgPv24 = avg(prev7Rows, "pv_24h");
  const currAvgPv24 = avg(curr7Rows, "pv_24h");
  const wowPv24Pct = prevAvgPv24 > 0 ? ((currAvgPv24 - prevAvgPv24) / prevAvgPv24) * 100 : 0;

  const clusterAverages = Object.values(
    dayRows.reduce<Record<string, { clusterId: string; count: number; pv24: number; likes: number }>>((acc, row) => {
      const clusterId = row.clusterId ?? "unknown";
      acc[clusterId] = acc[clusterId] ?? { clusterId, count: 0, pv24: 0, likes: 0 };
      acc[clusterId].count += 1;
      acc[clusterId].pv24 += row.pv_24h ?? 0;
      acc[clusterId].likes += row.likes ?? 0;
      return acc;
    }, {})
  )
    .map((x) => ({
      clusterId: x.clusterId,
      count: x.count,
      pv24Avg: x.count > 0 ? x.pv24 / x.count : 0,
      likesAvg: x.count > 0 ? x.likes / x.count : 0
    }))
    .sort((a, b) => b.pv24Avg - a.pv24Avg);

  const templateWinner =
    Object.values(
      dayRows.reduce<Record<string, { templateId: string; count: number; scoreSum: number }>>((acc, row) => {
        const templateId = row.templateId ?? "unknown";
        acc[templateId] = acc[templateId] ?? { templateId, count: 0, scoreSum: 0 };
        acc[templateId].count += 1;
        acc[templateId].scoreSum += row.score ?? 0;
        return acc;
      }, {})
    )
      .map((x) => ({
        templateId: x.templateId,
        count: x.count,
        scoreAvg: x.count > 0 ? x.scoreSum / x.count : 0
      }))
      .sort((a, b) => b.scoreAvg - a.scoreAvg)[0] ?? null;

  const articleSnap = await db().collection("articles").where("siteId", "==", payload.siteId).limit(2000).get();
  const articles = articleSnap.docs.map((d) => d.data() as ArticleRow);
  const recent7dArticles = windowByCreatedAt(articles, runEndMs - 7 * 24 * 60 * 60 * 1000, runEndMs);

  const clusterProgress = Object.values(
    articles.reduce<Record<string, { clusterId: string; postedCount: number }>>((acc, row) => {
      const clusterId = row.clusterId ?? "default";
      acc[clusterId] = acc[clusterId] ?? { clusterId, postedCount: 0 };
      if (row.status === "packaged" || row.status === "published") acc[clusterId].postedCount += 1;
      return acc;
    }, {})
  ).map((x) => ({
    clusterId: x.clusterId,
    postedCount: x.postedCount,
    phase2EntryRecommended: x.postedCount >= 15 && x.postedCount <= 25
  }));

  const recentHighPvCount = curr7Rows.filter((r) => (r.pv_24h ?? 0) >= 1000).length;
  const qaFailCount = recent7dArticles.filter((a) => a.qa?.pass === false).length;
  const qaFailRate = recent7dArticles.length > 0 ? qaFailCount / recent7dArticles.length : 0;
  const titleSimRows = recent7dArticles.filter((a) => typeof a.titleSimMax === "number");
  const titleSimAvg =
    titleSimRows.length > 0
      ? titleSimRows.reduce((s, a) => s + Number(a.titleSimMax ?? 0), 0) / titleSimRows.length
      : 0;
  const midCompetitionIncreaseRecommended =
    recentHighPvCount >= 3 && qaFailRate < 0.1 && titleSimAvg < 0.3;

  const docId = `${payload.siteId}_${payload.runDate}`;
  await db()
    .doc(`siteMetricsDaily/${docId}`)
    .set(
      {
        siteId: payload.siteId,
        runDate: payload.runDate,
        sampleCountDay: dayRows.length,
        pv24AvgDay: avg(dayRows, "pv_24h"),
        pv72AvgDay: avg(dayRows, "pv_72h"),
        likesAvgDay: avg(dayRows, "likes"),
        commentsAvgDay: avg(dayRows, "comments"),
        curr7dPv24Avg: currAvgPv24,
        prev7dPv24Avg: prevAvgPv24,
        wowPv24Pct,
        clusterAverages,
        templateWinner,
        clusterProgress,
        recommendations: {
          midCompetitionIncreaseRecommended,
          targetMidCompetitionShare: midCompetitionIncreaseRecommended ? 0.25 : 0.15,
          reasons: {
            recentHighPvCount,
            qaFailRate,
            titleSimAvg
          }
        },
        updatedAt: new Date()
      },
      { merge: true }
    );

  for (const cluster of clusterProgress) {
    const clusterDocId = `${payload.siteId}_${cluster.clusterId}`;
    await db()
      .doc(`clusters/${clusterDocId}`)
      .set(
        {
          siteId: payload.siteId,
          clusterId: cluster.clusterId,
          postedCount: cluster.postedCount,
          phase2EntryRecommended: cluster.phase2EntryRecommended,
          updatedAt: new Date()
        },
        { merge: true }
      );
  }

  await db().collection("logs").add({
    siteId: payload.siteId,
    type: "analyzer_daily",
    runDate: payload.runDate,
    createdAt: new Date(),
    metricsDailyDocId: docId
  });
}
