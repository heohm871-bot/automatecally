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
import { publishExecute } from "./tasks/publishExecute";
import { titleGenerate } from "./tasks/titleGenerate";
import { topcardRender } from "./tasks/topcardRender";

function getRuntimeEnv() {
  // Prefer an explicit APP_ENV; fall back to common local convention.
  const v = String(process.env.APP_ENV ?? process.env.INFRA_ENV ?? "").trim().toLowerCase();
  if (v === "prod" || v === "production") return "prod";
  if (v === "staging") return "staging";
  if (v === "dev" || v === "development") return "dev";
  return "dev";
}

function getRunTag(payload: AnyTaskPayload) {
  const raw = (payload as unknown as { runTag?: unknown })?.runTag;
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 24);
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : "";
}

function getRunReason(payload: AnyTaskPayload) {
  const raw = (payload as unknown as { runReason?: unknown })?.runReason;
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 120);
}

function enforceProdRunTagPolicy(payload: AnyTaskPayload) {
  const env = getRuntimeEnv();
  if (env !== "prod") return;

  const runTag = getRunTag(payload);
  if (!runTag) return; // default/prod path

  // 운영(prod) 재처리는 명시적인 runTag + 사유가 있어야만 허용.
  const allow = runTag === "prod-rerun" || runTag === "backfill";
  const reason = getRunReason(payload);
  if (!allow || !reason) {
    throw new Error("NON_RETRYABLE:prod_runTag_not_allowed_or_missing_reason");
  }
}

function todayKstDate() {
  // "en-CA" reliably produces YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export async function routeTask(payload: AnyTaskPayload) {
  const runRef = db().doc(`taskRuns/${payload.idempotencyKey}`);
  const runSnap = await runRef.get();
  if (runSnap.exists && runSnap.data()?.status === "success") return;

  // Include retryCount so an immediate retry (inline execution) doesn't deadlock on the same lock doc.
  const lockId = `lock:${payload.idempotencyKey}:r${payload.retryCount}`;
  await acquireLock(payload.siteId, lockId, 10 * 60);
  const startedAt = Date.now();
  await recordTaskSnapshot(payload, "running");
  const settings = await getGlobalSettings();

  try {
    enforceProdRunTagPolicy(payload);

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
    else if (payload.taskType === "publish_execute") await publishExecute(payload);
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

    // Guardrails: enforce fixed retry policy in code (same day only, max 1 retry, 30min delay).
    const retryLimit = 1;
    const retryDelaySec = 1800;
    const nonRetryable = errorText.startsWith("NON_RETRYABLE:");
    if (!nonRetryable && payload.retryCount < retryLimit) {
      // Only retry tasks for the same runDate (KST) to avoid stale retries crossing midnight.
      const today = todayKstDate();
      if (payload.runDate !== today) {
        await recordArticlePipelineEvent(payload, {
          type: "retry_skipped",
          detail: `runDate_mismatch:${payload.runDate}!=${today}`
        });
        return;
      }

      const retryQueue =
        payload.taskType === "body_generate" || payload.taskType === "image_generate" ? "heavy" : "light";
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
