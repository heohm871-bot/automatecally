import { randomUUID } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { taskHandler } from "./handlers/taskHandler";
import { db } from "./lib/admin";
import { getGlobalSettings } from "./lib/globalSettings";
import { randInt } from "./lib/jitter";
import { enqueueTask } from "./lib/tasks";
import { claimPipelineRun, finishPipelineRun } from "./lib/pipelineGuardrails";
import { opsHealth, opsSmoke } from "./handlers/opsEndpoints";
import { kstDayKey } from "../../packages/shared/kstDayKey";

export { taskHandler };
export { opsHealth, opsSmoke };

export const enqueueDailyPipelines = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const sitesSnap = await db().collection("sites").get();
    const settings = await getGlobalSettings();

    const runDate = new Date().toISOString().slice(0, 10);
    for (const doc of sitesSnap.docs) {
      const siteId = doc.id;
      const site = (doc.data() ?? {}) as { isEnabled?: boolean; dailyTarget?: number };
      if (site.isEnabled === false) continue;

      const pipelineVersion = "daily-v1";
      const pipelineTraceId = randomUUID();
      const { ref, claimed } = await claimPipelineRun({
        kind: "daily",
        siteId,
        runDate,
        pipelineVersion,
        traceId: pipelineTraceId
      });
      if (!claimed) continue;

      const jitterMin = Math.max(120, settings.pipeline.enqueueJitterSecMin);
      const jitterMax = Math.max(jitterMin, Math.min(300, settings.pipeline.enqueueJitterSecMax));

      const dailyTarget = typeof site.dailyTarget === "number" ? Math.floor(site.dailyTarget) : 3;
      const slotCount = Math.max(1, Math.min(6, Number.isFinite(dailyTarget) ? dailyTarget : 3));

      try {
        for (let slot = 1; slot <= slotCount; slot++) {
          const delaySec = randInt(jitterMin, jitterMax) + (slot - 1) * 120;
          const traceId = randomUUID();
          await enqueueTask({
            queue: "light",
            scheduleTimeSecFromNow: delaySec,
            ignoreAlreadyExists: true,
            payload: {
              schemaVersion: "1.0",
              taskType: "kw_collect",
              siteId,
              traceId,
              scheduleSlot: slot,
              idempotencyKey: `kw_collect:${siteId}:${runDate}:slot${slot}`,
              requestedByUid: "SYSTEM",
              createdAt: new Date().toISOString(),
              retryCount: 0,
              runDate
            }
          });
        }

        await enqueueTask({
          queue: "light",
          scheduleTimeSecFromNow: randInt(jitterMin, jitterMax) + 8 * 60,
          ignoreAlreadyExists: true,
          payload: {
            schemaVersion: "1.0",
            taskType: "analyzer_daily",
            siteId,
            traceId: randomUUID(),
            idempotencyKey: `analyzer_daily:${siteId}:${runDate}`,
            requestedByUid: "SYSTEM",
            createdAt: new Date().toISOString(),
            retryCount: 0,
            runDate
          }
        });

        await finishPipelineRun({ refPath: ref.path, state: "succeeded" });
      } catch (err: unknown) {
        const msg = String((err as { message?: unknown })?.message ?? err);
        await finishPipelineRun({
          refPath: ref.path,
          state: "failed",
          errorCode: msg.split(":")[0] || "UNKNOWN",
          errorMessage: msg
        });
        throw err;
      }
    }
  }
);

function isoDayAdd(dayKey: string, deltaDays: number) {
  const [y, m, d] = String(dayKey ?? "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function toNum(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export const opsWeeklyReport = onSchedule(
  // Mondays 10:15 KST, report covers last 7 KST days ending yesterday.
  { schedule: "15 10 * * 1", timeZone: "Asia/Seoul" },
  async () => {
    const today = kstDayKey(new Date());
    const end = isoDayAdd(today, -1);
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = isoDayAdd(end, -i);
      if (k) days.push(k);
    }
    if (days.length !== 7) return;

    const prevEnd = isoDayAdd(end, -7);
    const prevDays: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const k = isoDayAdd(prevEnd, -i);
      if (k) prevDays.push(k);
    }

    // pipelineRuns: success rate
    const prSnap = await db().collection("pipelineRuns").where("runDate", "in", days).limit(5000).get();
    let pipelineTotal = 0;
    let pipelineSucceeded = 0;
    let pipelineFailed = 0;
    for (const d of prSnap.docs) {
      const row = (d.data() ?? {}) as { state?: unknown };
      const s = String(row.state ?? "");
      if (!s) continue;
      pipelineTotal += 1;
      if (s === "succeeded") pipelineSucceeded += 1;
      else if (s === "failed") pipelineFailed += 1;
    }
    const pipelineSuccessRate = pipelineTotal > 0 ? pipelineSucceeded / pipelineTotal : 0;

    // taskRuns: skipped rate + avg duration
    const trSnap = await db().collection("taskRuns").where("runDate", "in", days).limit(5000).get();
    let taskTotal = 0;
    let taskSkipped = 0;
    let taskSucceeded = 0;
    let taskFailed = 0;
    let durationSumMs = 0;
    let durationCount = 0;
    for (const d of trSnap.docs) {
      const row = (d.data() ?? {}) as { state?: unknown; status?: unknown; durationMs?: unknown };
      const state = String(row.state ?? "");
      const status = String(row.status ?? "");
      taskTotal += 1;
      if (state === "skipped") taskSkipped += 1;
      if (state === "succeeded" || status === "success") taskSucceeded += 1;
      if (state === "failed" || status === "failed") taskFailed += 1;
      const ms = toNum(row.durationMs);
      if (ms > 0 && (state === "succeeded" || status === "success")) {
        durationSumMs += ms;
        durationCount += 1;
      }
    }
    const skippedRate = taskTotal > 0 ? taskSkipped / taskTotal : 0;
    const avgDurationMs = durationCount > 0 ? durationSumMs / durationCount : 0;

    // cost trend: sum of costDaily over the 7 days, and delta vs previous 7 days
    const costSnaps = await Promise.all(days.map((k) => db().doc(`costDaily/${k}`).get()));
    const costs = days.map((k, idx) => {
      const data = (costSnaps[idx].data() ?? {}) as { estimatedCostUsd?: unknown; llmCallCount?: unknown; estimatedTokens?: unknown; updatedAt?: unknown };
      return {
        dayKey: k,
        estimatedCostUsd: toNum(data.estimatedCostUsd),
        llmCallCount: Math.floor(toNum(data.llmCallCount)),
        estimatedTokens: Math.floor(toNum(data.estimatedTokens)),
        updatedAt: data.updatedAt ?? null
      };
    });
    const costTotalUsd = costs.reduce((s, r) => s + r.estimatedCostUsd, 0);

    let prevCostTotalUsd = 0;
    if (prevDays.length === 7) {
      const prevCostSnaps = await Promise.all(prevDays.map((k) => db().doc(`costDaily/${k}`).get()));
      prevCostTotalUsd = prevCostSnaps.reduce((s, snap) => s + toNum((snap.data() as { estimatedCostUsd?: unknown } | undefined)?.estimatedCostUsd), 0);
    }
    const costDeltaUsd = costTotalUsd - prevCostTotalUsd;

    const reportId = `week_end_${end}`;
    await db()
      .doc(`opsWeeklyReports/${reportId}`)
      .set(
        {
          kind: "weekly_ops_report",
          window: { startDayKey: days[0], endDayKey: days[days.length - 1], days },
          pipeline: {
            total: pipelineTotal,
            succeeded: pipelineSucceeded,
            failed: pipelineFailed,
            successRate: pipelineSuccessRate
          },
          tasks: {
            total: taskTotal,
            succeeded: taskSucceeded,
            failed: taskFailed,
            skipped: taskSkipped,
            skippedRate,
            avgDurationMs
          },
          cost: {
            totalUsd: costTotalUsd,
            deltaUsdVsPrev7d: costDeltaUsd,
            series: costs
          },
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { merge: true }
      );
  }
);
