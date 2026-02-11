import { db } from "../../lib/admin";
import type { AdvisorWeeklyGlobalPayload } from "../schema";

export async function advisorWeeklyGlobal(payload: AdvisorWeeklyGlobalPayload) {
  const weekKey = payload.weekKey ?? "YYYY-WWW";

  await db().doc(`advisorRuns_global/${weekKey}`).set(
    {
      weekKey,
      createdAt: new Date(),
      reportHtml: "<p>(TODO) 통합 주간 리포트</p>",
      deltas: {},
      summary: {}
    },
    { merge: true }
  );
}
