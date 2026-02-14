import { db } from "../lib/admin";
import { estimateCostUsd } from "../lib/llm/usageMetrics";

type Args = {
  start: string;
  end: string;
  dryRun: boolean;
  recomputeArticles: boolean;
  limit: number;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    start: "",
    end: "",
    dryRun: true,
    recomputeArticles: true,
    limit: 50_000
  };
  for (const a of argv) {
    if (a.startsWith("--start=")) out.start = a.slice("--start=".length);
    else if (a.startsWith("--end=")) out.end = a.slice("--end=".length);
    else if (a === "--dryRun=false" || a === "--dryRun=0") out.dryRun = false;
    else if (a === "--dryRun=true" || a === "--dryRun=1") out.dryRun = true;
    else if (a === "--recomputeArticles=false" || a === "--recomputeArticles=0") out.recomputeArticles = false;
    else if (a === "--recomputeArticles=true" || a === "--recomputeArticles=1") out.recomputeArticles = true;
    else if (a.startsWith("--limit=")) out.limit = Math.max(0, Math.floor(Number(a.slice("--limit=".length)) || 0));
  }
  return out;
}

function isDayKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type ArticleRow = {
  id: string;
  siteId?: string;
  runDate?: string;
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  llmCallCount?: number;
  llmCostAccounting?: { cacheHashes?: unknown };
};

type LlmCacheDoc = {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

function toNum(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function normInt(v: unknown) {
  return Math.max(0, Math.floor(toNum(v)));
}

async function recomputeArticleFromCacheHashes(article: ArticleRow) {
  const hashes = Array.isArray(article.llmCostAccounting?.cacheHashes) ? article.llmCostAccounting?.cacheHashes : [];
  const cacheHashes = hashes.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  const uniq = Array.from(new Set(cacheHashes));

  let tokens = 0;
  let cost = 0;
  let calls = 0;

  // Batched reads (in chunks) to avoid very large Promise.all.
  const chunkSize = 50;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const batch = uniq.slice(i, i + chunkSize);
    const snaps = await Promise.all(batch.map((h) => db().collection("llmCache").doc(h).get()));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const cur = (snap.data() ?? {}) as LlmCacheDoc;
      const model = String(cur.model ?? "").trim();
      const usage = (cur.usage ?? {}) as Record<string, unknown>;
      const totalTokens = normInt(usage.total_tokens) || normInt(usage.input_tokens) + normInt(usage.output_tokens);
      const inputTokens = normInt(usage.input_tokens);
      const outputTokens = normInt(usage.output_tokens);
      const estimated = model ? estimateCostUsd({ model, inputTokens, outputTokens }) : 0;
      tokens += totalTokens;
      cost += estimated;
      if (totalTokens > 0) calls += 1;
    }
  }

  return { cacheHashes: uniq, estimatedTokens: tokens, estimatedCostUsd: cost, llmCallCount: calls };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isDayKey(args.start) || !isDayKey(args.end)) {
    console.error(
      JSON.stringify(
        { ok: false, code: "BAD_ARGS", message: "Require --start=YYYY-MM-DD and --end=YYYY-MM-DD" },
        null,
        2
      )
    );
    process.exit(1);
  }
  if (args.start > args.end) {
    console.error(JSON.stringify({ ok: false, code: "BAD_ARGS", message: "--start must be <= --end" }, null, 2));
    process.exit(1);
  }

  const dryRun = args.dryRun;
  const t0 = Date.now();

  const anomalies: Array<{ type: string; articleId: string; siteId: string; runDate: string; detail: string }> = [];

  const totalsByDay = new Map<string, { tokens: number; cost: number; calls: number; sites: Map<string, { tokens: number; cost: number; calls: number }> }>();

  let scanned = 0;
  let updatedArticles = 0;
  let totalPlannedWrites = 0;

  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let q = db()
      .collection("articles")
      .where("runDate", ">=", args.start)
      .where("runDate", "<=", args.end)
      .orderBy("runDate", "asc")
      .orderBy("__name__", "asc")
      .limit(500);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (snap.empty) break;
    last = snap.docs[snap.docs.length - 1] ?? null;

    for (const d of snap.docs) {
      scanned += 1;
      if (args.limit > 0 && scanned > args.limit) break;
      const data = (d.data() ?? {}) as Omit<ArticleRow, "id">;
      const row: ArticleRow = { id: d.id, ...data };
      const siteId = String(row.siteId ?? "").trim();
      const runDate = String(row.runDate ?? "").slice(0, 10);
      if (!siteId || !isDayKey(runDate)) continue;

      let estTokens = normInt(row.estimatedTokens);
      let estCost = Math.max(0, toNum(row.estimatedCostUsd));
      let calls = normInt(row.llmCallCount);

      if (args.recomputeArticles) {
        const computed = await recomputeArticleFromCacheHashes(row);
        estTokens = computed.estimatedTokens;
        estCost = computed.estimatedCostUsd;
        calls = computed.llmCallCount;

        if (!dryRun) {
          totalPlannedWrites += 1;
          await db()
            .doc(`articles/${row.id}`)
            .set(
              {
                estimatedTokens: estTokens,
                estimatedCostUsd: estCost,
                llmCallCount: calls,
                llmCostAccounting: { cacheHashes: computed.cacheHashes },
                estimatedUpdatedAt: new Date(),
                estimatedRecomputedAt: new Date()
              },
              { merge: true }
            );
          updatedArticles += 1;
        }
      }

      if (estTokens === 0 && estCost > 0) anomalies.push({ type: "tokens_zero_cost_positive", articleId: row.id, siteId, runDate, detail: `cost=${estCost}` });
      if (calls > 0 && estTokens === 0) anomalies.push({ type: "calls_positive_tokens_zero", articleId: row.id, siteId, runDate, detail: `calls=${calls}` });

      const day = totalsByDay.get(runDate) ?? { tokens: 0, cost: 0, calls: 0, sites: new Map() };
      day.tokens += estTokens;
      day.cost += estCost;
      day.calls += calls;
      const site = day.sites.get(siteId) ?? { tokens: 0, cost: 0, calls: 0 };
      site.tokens += estTokens;
      site.cost += estCost;
      site.calls += calls;
      day.sites.set(siteId, site);
      totalsByDay.set(runDate, day);
    }

    if (args.limit > 0 && scanned > args.limit) break;
  }

  // costDaily recompute (overwrite).
  const dayKeys = Array.from(totalsByDay.keys()).sort();
  const plannedCostWrites = dayKeys.length + dayKeys.reduce((acc, k) => acc + totalsByDay.get(k)!.sites.size, 0);
  if (!dryRun) {
    for (const dayKey of dayKeys) {
      const day = totalsByDay.get(dayKey)!;
      totalPlannedWrites += 1;
      await db()
        .doc(`costDaily/${dayKey}`)
        .set(
          {
            dayKey,
            estimatedTokens: day.tokens,
            estimatedCostUsd: day.cost,
            llmCallCount: day.calls,
            updatedAt: new Date(),
            recomputedAt: new Date()
          },
          { merge: true }
        );

      for (const [siteId, s] of day.sites.entries()) {
        totalPlannedWrites += 1;
        await db()
          .doc(`costDaily/${dayKey}/sites/${siteId}`)
          .set(
            {
              dayKey,
              siteId,
              estimatedTokens: s.tokens,
              estimatedCostUsd: s.cost,
              llmCallCount: s.calls,
              updatedAt: new Date(),
              recomputedAt: new Date()
            },
            { merge: true }
          );
      }
    }
  }

  const report = dayKeys.map((k) => {
    const day = totalsByDay.get(k)!;
    const sites = Array.from(day.sites.entries())
      .map(([siteId, s]) => ({ siteId, estimatedTokens: s.tokens, estimatedCostUsd: Number(s.cost.toFixed(6)), llmCallCount: s.calls }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
    return { dayKey: k, estimatedTokens: day.tokens, estimatedCostUsd: Number(day.cost.toFixed(6)), llmCallCount: day.calls, sites };
  });

  const out = {
    ok: true,
    mode: dryRun ? "dryRun" : "apply",
    args,
    scannedArticles: scanned,
    updatedArticles,
    plannedCostDocWrites: plannedCostWrites,
    totalWrites: dryRun ? plannedCostWrites : totalPlannedWrites,
    anomalies: anomalies.slice(0, 200),
    totals: report,
    durationMs: Date.now() - t0
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, code: "COST_RECOMPUTE_FAILED", message: String((err as any)?.message ?? err) }, null, 2));
  process.exit(1);
});

