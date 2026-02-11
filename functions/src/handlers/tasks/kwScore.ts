import { db } from "../../lib/admin";
import { getGlobalSettings } from "../../lib/globalSettings";
import { enqueueTask } from "../../lib/tasks";
import { compRatio } from "../../../../packages/shared/scoringConfig";
import type { TaskBase } from "../schema";

type KeywordCandidate = {
  id: string;
  trend3?: number;
  trend7?: number;
  trend30?: number;
  blogDocs?: number;
};

function pickOne<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function kwScore(payload: TaskBase) {
  const snap = await db()
    .collection("keywords")
    .where("siteId", "==", payload.siteId)
    .where("status", "==", "candidate")
    .limit(300)
    .get();

  if (snap.empty) return;

  const settings = await getGlobalSettings();
  const cfg = settings.growth;
  const candidates: KeywordCandidate[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      trend3: typeof data.trend3 === "number" ? data.trend3 : undefined,
      trend7: typeof data.trend7 === "number" ? data.trend7 : undefined,
      trend30: typeof data.trend30 === "number" ? data.trend30 : undefined,
      blogDocs: typeof data.blogDocs === "number" ? data.blogDocs : undefined
    };
  });

  const filtered = candidates.filter((k) => (k.trend30 ?? 0) >= cfg.minTrend30 && (k.trend7 ?? 0) >= cfg.minTrend7);

  const filtered2 = filtered.filter((k) => {
    const cr = compRatio(k.blogDocs ?? 9999999, k.trend30 ?? 0);
    return (k.blogDocs ?? 9999999) <= cfg.hardBlogDocsMax && cr <= cfg.hardCompRatioMax;
  });

  const low = filtered2.filter((k) => {
    const cr = compRatio(k.blogDocs ?? 9999999, k.trend30 ?? 0);
    return (k.blogDocs ?? 9999999) <= cfg.lowBlogDocsMax || cr <= cfg.lowCompRatioMax;
  });

  const lowIds = new Set(low.map((x) => x.id));
  const mid = filtered2.filter((k) => {
    const cr = compRatio(k.blogDocs ?? 9999999, k.trend30 ?? 0);
    return ((k.blogDocs ?? 9999999) <= cfg.midBlogDocsMax || cr <= cfg.midCompRatioMax) && !lowIds.has(k.id);
  });

  if (low.length === 0 && mid.length === 0) return;

  const useMid = mid.length > 0 && Math.random() < cfg.midCompetitionShare;
  const chosen = useMid ? pickOne(mid) : low.length > 0 ? pickOne(low) : pickOne(mid);

  await db().doc(`keywords/${chosen.id}`).set({ status: "selected", selectedAt: new Date() }, { merge: true });

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "title_generate",
      idempotencyKey: `title_generate:${payload.siteId}:${chosen.id}`,
      keywordId: chosen.id
    }
  });
}
