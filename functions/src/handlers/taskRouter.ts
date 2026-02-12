import { db } from "../lib/admin";
import { getGlobalSettings } from "../lib/globalSettings";
import { acquireLock, releaseLock } from "../lib/locks";
import { recordArticlePipelineEvent, recordTaskSnapshot } from "../lib/pipelineTimeline";
import { enqueueTask } from "../lib/tasks";
import type { AnyTaskPayload } from "./schema";

import { advisorWeeklyGlobal } from "./tasks/advisorWeeklyGlobal";
import { analyzerDaily } from "./tasks/analyzerDaily";
import { articlePackage } from "./tasks/articlePackage";
import { articleQa } from "./tasks/articleQa";
import { articleQaFix } from "./tasks/articleQaFix";
import { articleGenerate } from "./tasks/articleGenerate";
import { bodyGenerate } from "./tasks/bodyGenerate";
import { imageGenerate } from "./tasks/imageGenerate";
import { kwCollect } from "./tasks/kwCollect";
import { kwScore } from "./tasks/kwScore";
import { titleGenerate } from "./tasks/titleGenerate";
import { topcardRender } from "./tasks/topcardRender";

export async function routeTask(payload: AnyTaskPayload) {
  const runRef = db().doc(`taskRuns/${payload.idempotencyKey}`);
  const runSnap = await runRef.get();
  if (runSnap.exists && runSnap.data()?.status === "success") return;

  const lockId = `lock:${payload.idempotencyKey}`;
  await acquireLock(payload.siteId, lockId, 10 * 60);
  const startedAt = Date.now();
  await recordTaskSnapshot(payload, "running");
  const settings = await getGlobalSettings();

  try {
    if (payload.taskType === "kw_collect") await kwCollect(payload);
    else if (payload.taskType === "kw_score") await kwScore(payload);
    else if (payload.taskType === "article_generate") await articleGenerate(payload);
    else if (payload.taskType === "title_generate") await titleGenerate(payload);
    else if (payload.taskType === "body_generate") await bodyGenerate(payload);
    else if (payload.taskType === "article_qa") await articleQa(payload);
    else if (payload.taskType === "article_qa_fix") await articleQaFix(payload);
    else if (payload.taskType === "topcard_render") await topcardRender(payload);
    else if (payload.taskType === "image_generate") await imageGenerate(payload);
    else if (payload.taskType === "article_package") await articlePackage(payload);
    else if (payload.taskType === "analyzer_daily") await analyzerDaily(payload);
    else if (payload.taskType === "advisor_weekly_global") await advisorWeeklyGlobal(payload);
    else throw new Error("Unknown taskType");

    await runRef.set({ status: "success" }, { merge: true });
    await recordTaskSnapshot(payload, "success", { durationMs: Date.now() - startedAt });
  } catch (err: unknown) {
    const errorText = String((err as { message?: string })?.message ?? err);
    await runRef.set(
      {
        siteId: payload.siteId,
        taskType: payload.taskType,
        status: "failed",
        updatedAt: new Date(),
        error: errorText
      },
      { merge: true }
    );
    await recordTaskSnapshot(payload, "failed", {
      error: errorText,
      durationMs: Date.now() - startedAt
    });

    if (payload.retryCount < settings.pipeline.retrySameDayMax) {
      const retryQueue =
        payload.taskType === "body_generate" || payload.taskType === "image_generate" ? "heavy" : "light";
      const retryDelaySec = settings.pipeline.retryDelaySec;
      await enqueueTask({
        queue: retryQueue,
        scheduleTimeSecFromNow: retryDelaySec,
        payload: { ...payload, retryCount: (payload.retryCount + 1) as 0 | 1 }
      });
      await recordArticlePipelineEvent(payload, {
        type: "retry_enqueued",
        detail: "single retry scheduled",
        queue: retryQueue,
        delaySec: retryDelaySec
      });
    }
  } finally {
    await releaseLock(lockId);
  }
}
