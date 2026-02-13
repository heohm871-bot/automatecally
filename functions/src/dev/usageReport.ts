import { db } from "../lib/admin";

type UsageDoc = {
  dayKey?: string;
  monthKey?: string;
  totals?: {
    calls?: number;
    cacheHits?: number;
    cacheMisses?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
};

function toNum(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function run() {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);
  const monthDay = Number(dayKey.slice(-2));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const [dailySnap, monthlySnap] = await Promise.all([db().doc(`usageDaily/${dayKey}`).get(), db().doc(`usageMonthly/${monthKey}`).get()]);

  const daily = (dailySnap.data() ?? {}) as UsageDoc;
  const monthly = (monthlySnap.data() ?? {}) as UsageDoc;
  const dailyCost = toNum(daily.totals?.estimatedCostUsd);
  const monthlyCost = toNum(monthly.totals?.estimatedCostUsd);
  const dayCalls = toNum(daily.totals?.calls);
  const dayHits = toNum(daily.totals?.cacheHits);
  const dayMisses = toNum(daily.totals?.cacheMisses);
  const dayHitRate = dayCalls > 0 ? dayHits / dayCalls : 0;
  const daySavedRatio = dayHits + dayMisses > 0 ? dayHits / (dayHits + dayMisses) : 0;
  const projected = monthDay > 0 ? (monthlyCost / monthDay) * daysInMonth : monthlyCost;

  console.log(
    JSON.stringify(
      {
        dayKey,
        monthKey,
        today: {
          costUsd: Number(dailyCost.toFixed(6)),
          calls: dayCalls,
          cacheHitRate: Number(dayHitRate.toFixed(4)),
          cacheSavedRatio: Number(daySavedRatio.toFixed(4)),
          inputTokens: toNum(daily.totals?.inputTokens),
          outputTokens: toNum(daily.totals?.outputTokens),
          totalTokens: toNum(daily.totals?.totalTokens)
        },
        month: {
          costUsd: Number(monthlyCost.toFixed(6)),
          projectedCostUsd: Number(projected.toFixed(6)),
          calls: toNum(monthly.totals?.calls),
          inputTokens: toNum(monthly.totals?.inputTokens),
          outputTokens: toNum(monthly.totals?.outputTokens),
          totalTokens: toNum(monthly.totals?.totalTokens)
        }
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, message: String((err as { message?: string })?.message ?? err) }, null, 2));
  process.exit(1);
});
