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

function shuffle<T>(arr: T[]) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
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

  const slot =
    typeof (payload as { scheduleSlot?: unknown }).scheduleSlot === "number"
      ? Math.max(1, Math.floor((payload as { scheduleSlot?: number }).scheduleSlot ?? 1))
      : 1;
  const useMid = mid.length > 0 && Math.random() < cfg.midCompetitionShare;
  const pool = useMid ? (mid.length > 0 ? mid : low) : low.length > 0 ? low : mid;
  const ordered = shuffle(pool);
  let chosen: KeywordCandidate | null = null;

  for (const candidate of ordered) {
    const kwRef = db().doc(`keywords/${candidate.id}`);
    const picked = await db().runTransaction(async (tx) => {
      const kwSnap = await tx.get(kwRef);
      if (!kwSnap.exists) return false;
      const kwData = (kwSnap.data() ?? {}) as { status?: string };
      if (kwData.status !== "candidate") return false;
      tx.set(
        kwRef,
        {
          status: "selected",
          selectedAt: new Date(),
          selectedRunDate: payload.runDate,
          selectedSlot: slot
        },
        { merge: true }
      );
      return true;
    });
    if (picked) {
      chosen = candidate;
      break;
    }
  }

  if (!chosen) return;

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      scheduleSlot: slot,
      taskType: "title_generate",
      idempotencyKey: `title_generate:${payload.siteId}:${payload.runDate}:${chosen.id}`,
      keywordId: chosen.id
    }
  });
}
