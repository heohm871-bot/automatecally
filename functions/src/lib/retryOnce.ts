import { db } from "./admin";
import { getGlobalSettings } from "./globalSettings";
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

function pickRetryQueue(taskType: string): "light" | "heavy" {
  return taskType === "body_generate" || taskType === "image_generate" ? "heavy" : "light";
}

export async function maybeEnqueueSingleRetry(payload: TaskPayloadBase) {
  try {
    const settings = await getGlobalSettings();
    const retryLimit = Math.min(1, Math.max(0, settings.pipeline.retrySameDayMax));
    if (payload.retryCount >= retryLimit) return;

    const retryDelaySec = Math.max(0, Math.floor(settings.pipeline.retryDelaySec));
    const queue = pickRetryQueue(payload.taskType);
    const retryPayload = { ...payload, retryCount: (payload.retryCount + 1) as 0 | 1 };
    await enqueueTask({
      queue,
      scheduleTimeSecFromNow: retryDelaySec,
      ignoreAlreadyExists: true,
      payload: retryPayload
    });
  } catch {
    // Best-effort only. The main retry path is taskRouter's catch (after routeTask),
    // this one is for early failures (schema parse / unexpected handler crash).
  }
}
