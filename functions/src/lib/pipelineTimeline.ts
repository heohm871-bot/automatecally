import { getAdmin, db } from "./admin";
import type { AnyTaskPayload } from "../handlers/schema";

type TaskEventStatus = "running" | "success" | "failed";

function getArticleId(payload: AnyTaskPayload): string | null {
  const maybe = (payload as Record<string, unknown>).articleId;
  return typeof maybe === "string" && maybe.length > 0 ? maybe : null;
}

export async function recordTaskSnapshot(
  payload: AnyTaskPayload,
  status: TaskEventStatus,
  args?: { error?: string; durationMs?: number }
) {
  const now = new Date();
  const runRef = db().doc(`taskRuns/${payload.idempotencyKey}`);

  await runRef.set(
    {
      siteId: payload.siteId,
      traceId: payload.traceId,
      taskType: payload.taskType,
      status,
      retryCount: payload.retryCount,
      runDate: payload.runDate,
      updatedAt: now,
      ...(status === "running" ? { startedAt: now } : {}),
      ...(args?.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
      ...(args?.error ? { error: args.error } : {})
    },
    { merge: true }
  );

  const articleId = getArticleId(payload);
  if (!articleId) return;

  const timelineEntry = {
    at: now.toISOString(),
    taskType: payload.taskType,
    status,
    traceId: payload.traceId,
    idempotencyKey: payload.idempotencyKey,
    retryCount: payload.retryCount,
    ...(args?.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
    ...(args?.error ? { error: args.error } : {})
  };
  const traceEntry = {
    task: payload.taskType,
    at: now.toISOString(),
    ok: status === "running" ? null : status === "success",
    status,
    traceId: payload.traceId,
    retryCount: payload.retryCount,
    ...(args?.error ? { error: args.error } : {})
  };

  await db()
    .doc(`articles/${articleId}`)
    .set(
      {
        pipelineLastTask: payload.taskType,
        pipelineLastStatus: status,
        pipelineUpdatedAt: now,
        pipelineHistory: getAdmin().firestore.FieldValue.arrayUnion(timelineEntry),
        trace: getAdmin().firestore.FieldValue.arrayUnion(traceEntry)
      },
      { merge: true }
    );
}

export async function recordArticlePipelineEvent(
  payload: AnyTaskPayload,
  event: { type: string; detail?: string; queue?: "light" | "heavy"; delaySec?: number }
) {
  const articleId = getArticleId(payload);
  if (!articleId) return;

  const now = new Date();
  const timelineEntry = {
    at: now.toISOString(),
    taskType: payload.taskType,
    status: "running",
    eventType: event.type,
    detail: event.detail ?? null,
    queue: event.queue ?? null,
    delaySec: event.delaySec ?? null,
    traceId: payload.traceId,
    idempotencyKey: payload.idempotencyKey,
    retryCount: payload.retryCount
  };

  await db()
    .doc(`articles/${articleId}`)
    .set(
      {
        pipelineLastTask: payload.taskType,
        pipelineLastStatus: "running",
        pipelineUpdatedAt: now,
        pipelineHistory: getAdmin().firestore.FieldValue.arrayUnion(timelineEntry)
      },
      { merge: true }
    );
}
