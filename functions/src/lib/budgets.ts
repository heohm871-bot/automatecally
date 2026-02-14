import { db } from "./admin";

function thresholdKey(ratio: number) {
  const pct = Math.max(0, Math.round(ratio * 100));
  return `p${pct}`;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function safeNum(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

type BudgetsCfg = {
  dailyUsdTotal: number;
  dailyUsdPerSite: number;
  alertThresholds: number[];
  alertWebhookUrl: string;
};

export async function budgetCheckAndMaybeAlert(args: {
  siteId: string;
  runDate: string; // KST dayKey
  budgets: BudgetsCfg;
  taskType: string;
}) {
  const cfg = args.budgets;
  const limitTotal = safeNum(cfg.dailyUsdTotal);
  const limitSite = safeNum(cfg.dailyUsdPerSite);
  const webhookUrl = String(cfg.alertWebhookUrl ?? "").trim();
  const thresholds = Array.isArray(cfg.alertThresholds) ? cfg.alertThresholds : [];
  const enabled = (limitTotal > 0 || limitSite > 0) && thresholds.length > 0;

  if (!enabled) {
    return {
      enabled: false as const,
      stop: false,
      total: { cost: 0, limit: limitTotal, ratio: 0 },
      site: { cost: 0, limit: limitSite, ratio: 0 }
    };
  }

  const dayKey = String(args.runDate ?? "").slice(0, 10);
  const dailyRef = db().doc(`costDaily/${dayKey}`);
  const siteRef = db().doc(`costDaily/${dayKey}/sites/${args.siteId}`);

  const [dailySnap, siteSnap] = await Promise.all([dailyRef.get(), siteRef.get()]);
  const daily = (dailySnap.data() ?? {}) as Record<string, unknown>;
  const site = (siteSnap.data() ?? {}) as Record<string, unknown>;
  const totalCost = Math.max(0, safeNum(daily.estimatedCostUsd));
  const siteCost = Math.max(0, safeNum(site.estimatedCostUsd));

  const totalRatio = limitTotal > 0 ? clamp01(totalCost / limitTotal) : 0;
  const siteRatio = limitSite > 0 ? clamp01(siteCost / limitSite) : 0;
  const stop = (limitTotal > 0 && totalCost >= limitTotal) || (limitSite > 0 && siteCost >= limitSite);

  // Alerts are best-effort and must be de-duplicated.
  if (webhookUrl) {
    const crossed: Array<{ scope: "total" | "site"; ratio: number }> = [];
    for (const t of thresholds) {
      const r = typeof t === "number" && Number.isFinite(t) ? t : 0;
      if (r <= 0) continue;
      if (limitTotal > 0 && totalRatio >= r) crossed.push({ scope: "total", ratio: r });
      if (limitSite > 0 && siteRatio >= r) crossed.push({ scope: "site", ratio: r });
    }

    for (const c of crossed) {
      const key = thresholdKey(c.ratio);
      const ref = c.scope === "total" ? dailyRef : siteRef;
      const shouldSend = await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const cur = (snap.data() ?? {}) as Record<string, unknown>;
        const alertsSent = (cur.alertsSent ?? {}) as Record<string, unknown>;
        if (alertsSent && alertsSent[key] === true) return false;
        tx.set(ref, { [`alertsSent.${key}`]: true, updatedAt: new Date() }, { merge: true });
        return true;
      });
      if (!shouldSend) continue;

      const payload = {
        type: "budget_threshold",
        scope: c.scope,
        threshold: c.ratio,
        runDate: dayKey,
        siteId: args.siteId,
        taskType: args.taskType,
        total: { costUsd: totalCost, limitUsd: limitTotal, ratio: totalRatio },
        site: { costUsd: siteCost, limitUsd: limitSite, ratio: siteRatio }
      };
      // Never fail the task because alert delivery failed.
      void fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "automatecally-functions" },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  }

  return {
    enabled: true as const,
    stop,
    total: { cost: totalCost, limit: limitTotal, ratio: totalRatio },
    site: { cost: siteCost, limit: limitSite, ratio: siteRatio }
  };
}
