import { randomUUID } from "node:crypto";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { taskHandler } from "./handlers/taskHandler";
import { db } from "./lib/admin";
import { getGlobalSettings } from "./lib/globalSettings";
import { randInt } from "./lib/jitter";
import { enqueueTask } from "./lib/tasks";

export { taskHandler };

export const enqueueDailyPipelines = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Seoul" },
  async () => {
    const sitesSnap = await db().collection("sites").get();
    const settings = await getGlobalSettings();

    const runDate = new Date().toISOString().slice(0, 10);
    for (const doc of sitesSnap.docs) {
      const siteId = doc.id;

      const delaySec = randInt(settings.pipeline.enqueueJitterSecMin, settings.pipeline.enqueueJitterSecMax);
      const traceId = randomUUID();

      await enqueueTask({
        queue: "light",
        scheduleTimeSecFromNow: delaySec,
        payload: {
          schemaVersion: "1.0",
          taskType: "kw_collect",
          siteId,
          traceId,
          idempotencyKey: `kw_collect:${siteId}:${runDate}`,
          requestedByUid: "SYSTEM",
          createdAt: new Date().toISOString(),
          retryCount: 0,
          runDate
        }
      });

      await enqueueTask({
        queue: "light",
        scheduleTimeSecFromNow: delaySec + 30,
        payload: {
          schemaVersion: "1.0",
          taskType: "analyzer_daily",
          siteId,
          traceId,
          idempotencyKey: `analyzer_daily:${siteId}:${runDate}`,
          requestedByUid: "SYSTEM",
          createdAt: new Date().toISOString(),
          retryCount: 0,
          runDate
        }
      });
    }
  }
);
