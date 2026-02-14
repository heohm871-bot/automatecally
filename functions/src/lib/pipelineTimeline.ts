import { getAdmin, db } from "./admin";
import type { AnyTaskPayload } from "../handlers/schema";

type TaskEventStatus = "queued" | "running" | "success" | "failed";

function toState(status: TaskEventStatus) {
  if (status === "success") return "succeeded";
  return status;
}

function extractErrorCode(errorText: string) {
  const s = String(errorText ?? "").trim();
  if (!s) return null;
  if (s.startsWith("NON_RETRYABLE:")) {
    const rest = s.slice("NON_RETRYABLE:".length);
    const code = rest.split(":")[0]?.trim();
    return code || "NON_RETRYABLE";
  }
  return s.split(":")[0]?.trim() || "UNKNOWN";
}

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

  const attemptCount = payload.retryCount + 1;
  const errorText = String(args?.error ?? "").trim();
  const lastErrorCode = status === "failed" ? extractErrorCode(errorText) : null;
  const lastErrorMessage = status === "failed" ? (errorText || null) : null;

  await runRef.set(
    {
      siteId: payload.siteId,
      traceId: payload.traceId,
      taskType: payload.taskType,
      status,
      state: toState(status),
      retryCount: payload.retryCount,
      attemptCount,
      runDate: payload.runDate,
      updatedAt: now,
      ...(status === "queued" ? { queuedAt: now } : {}),
      ...(status === "running" ? { startedAt: now } : {}),
      ...(args?.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
      ...(args?.error ? { error: args.error } : {}),
      ...(lastErrorCode ? { lastErrorCode } : {}),
      ...(lastErrorMessage ? { lastErrorMessage } : {})
    },
    { merge: true }
  );

  const articleId = getArticleId(payload);
  if (!articleId) return;

  const timelineEntry = {
    at: now.toISOString(),
    taskType: payload.taskType,
    status,
    state: toState(status),
    traceId: payload.traceId,
    idempotencyKey: payload.idempotencyKey,
    retryCount: payload.retryCount,
    attemptCount,
    ...(args?.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
    ...(args?.error ? { error: args.error } : {}),
    ...(lastErrorCode ? { lastErrorCode } : {})
  };
  const traceEntry = {
    task: payload.taskType,
    at: now.toISOString(),
    ok: status === "queued" || status === "running" ? null : status === "success",
    status,
    state: toState(status),
    traceId: payload.traceId,
    retryCount: payload.retryCount,
    attemptCount,
    ...(args?.error ? { error: args.error } : {}),
    ...(lastErrorCode ? { lastErrorCode } : {})
  };

  await db()
    .doc(`articles/${articleId}`)
    .set(
      {
        pipelineLastTask: payload.taskType,
        pipelineLastStatus: status,
        pipelineLastState: toState(status),
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
