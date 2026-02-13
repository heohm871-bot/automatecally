import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { TaskBase } from "../schema";

export async function kwCollect(payload: TaskBase) {
  const slot =
    typeof (payload as { scheduleSlot?: unknown }).scheduleSlot === "number"
      ? Math.max(1, Math.floor((payload as { scheduleSlot?: number }).scheduleSlot ?? 1))
      : 1;

  await db().collection("logs").add({
    siteId: payload.siteId,
    traceId: payload.traceId,
    type: "kw_collect",
    scheduleSlot: slot,
    createdAt: new Date()
  });

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "kw_score",
      scheduleSlot: slot,
      idempotencyKey: `kw_score:${payload.siteId}:${payload.runDate}:slot${slot}`
    }
  });
}
