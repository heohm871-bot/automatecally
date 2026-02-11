import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { TaskBase } from "../schema";

export async function kwCollect(payload: TaskBase) {
  await db().collection("logs").add({
    siteId: payload.siteId,
    traceId: payload.traceId,
    type: "kw_collect",
    createdAt: new Date()
  });

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "kw_score",
      idempotencyKey: `kw_score:${payload.siteId}:${payload.runDate}`
    }
  });
}
