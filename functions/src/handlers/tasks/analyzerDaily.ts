import { db } from "../../lib/admin";
import type { TaskBase } from "../schema";

export async function analyzerDaily(payload: TaskBase) {
  await db().collection("logs").add({
    siteId: payload.siteId,
    type: "analyzer_daily",
    runDate: payload.runDate,
    createdAt: new Date()
  });
}
