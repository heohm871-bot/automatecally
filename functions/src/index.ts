import { randomUUID } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { taskHandler } from "./handlers/taskHandler";
import { db } from "./lib/admin";
import { getGlobalSettings } from "./lib/globalSettings";
import { randInt } from "./lib/jitter";
import { enqueueTask } from "./lib/tasks";
import { claimPipelineRun, finishPipelineRun } from "./lib/pipelineGuardrails";

export { taskHandler };

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
