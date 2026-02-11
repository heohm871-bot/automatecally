import { db } from "./admin";
import { enqueueTask } from "./tasks";

export type TaskPayloadBase = {
  schemaVersion: "1.0";
  taskType: string;
  siteId: string;
  traceId: string;
  idempotencyKey: string;
  createdAt: string;
  requestedByUid: string;
  retryCount: 0 | 1;
  runDate: string;
};

export async function recordFailure(payload: Record<string, unknown>, err: unknown) {
  const id = `${String(payload.idempotencyKey ?? "unknown")}:${String(payload.retryCount ?? "?")}`;
  await db()
    .doc(`taskFailures/${id}`)
    .set(
      {
        siteId: payload.siteId,
        taskType: payload.taskType,
        traceId: payload.traceId,
        idempotencyKey: payload.idempotencyKey,
        retryCount: payload.retryCount,
        runDate: payload.runDate,
        error: String((err as { message?: string })?.message ?? err),
        createdAt: new Date()
      },
      { merge: true }
    );
}

export async function maybeEnqueueSingleRetry(payload: TaskPayloadBase, queue: "light" | "heavy") {
  if (payload.retryCount !== 0) return;

  const retryPayload = { ...payload, retryCount: 1 as const };
  await enqueueTask({ queue, scheduleTimeSecFromNow: 30 * 60, payload: retryPayload });
}
