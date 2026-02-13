import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { TaskBase } from "../schema";
import { buildKeywordCandidates, normalizeKeyword } from "../../lib/keywordCandidates";
import { createHash } from "node:crypto";

type SiteDoc = {
  topic?: string;
  seedKeywords?: string[];
};

function makeKeywordId(siteId: string, textNorm: string) {
  const digest = createHash("sha256").update(`${siteId}:${textNorm}`).digest("hex").slice(0, 24);
  return `k_${digest}`;
}

function isAlreadyExistsError(err: unknown) {
  const code = Number((err as { code?: unknown })?.code);
  if (code === 6) return true;
  const message = String((err as { message?: unknown })?.message ?? "");
  return message.includes("ALREADY_EXISTS") || message.toLowerCase().includes("already exists");
}

async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (q.length > 0) {
      const next = q.shift();
      if (next === undefined) return;
      await fn(next);
    }
  });
  await Promise.all(workers);
}

export async function kwCollect(payload: TaskBase) {
  const slot =
    typeof (payload as { scheduleSlot?: unknown }).scheduleSlot === "number"
      ? Math.max(1, Math.floor((payload as { scheduleSlot?: number }).scheduleSlot ?? 1))
      : 1;
  const runTagRaw = (payload as unknown as { runTag?: unknown })?.runTag;
  const runTag = typeof runTagRaw === "string" && runTagRaw.trim() ? runTagRaw.trim().slice(0, 24) : "";

  const siteSnap = await db().doc(`sites/${payload.siteId}`).get();
  const site = (siteSnap.data() ?? {}) as SiteDoc;
  const topic = normalizeKeyword(site.topic ?? "");
  const seeds = Array.isArray(site.seedKeywords) ? site.seedKeywords : [];

  const candidates = buildKeywordCandidates({
    siteId: payload.siteId,
    topic,
    seedKeywords: seeds,
    runDate: payload.runDate,
    scheduleSlot: slot,
    max: 250
  });

  let created = 0;
  await mapLimit(candidates, 10, async (c) => {
    const id = makeKeywordId(payload.siteId, c.textNorm);
    const ref = db().doc(`keywords/${id}`);
    try {
      await ref.create({
        siteId: payload.siteId,
        text: c.text,
        textNorm: c.textNorm,
        topic,
        clusterId: c.clusterId,
        status: "candidate",
        trend3: c.trend3,
        trend7: c.trend7,
        trend30: c.trend30,
        blogDocs: c.blogDocs,
        metricsSource: c.metricsSource,
        source: c.source,
        collectedRunDate: payload.runDate,
        collectedSlot: slot,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      created += 1;
    } catch (err: unknown) {
      if (isAlreadyExistsError(err)) return;
      throw err;
    }
  });

  await db().collection("logs").add({
    siteId: payload.siteId,
    traceId: payload.traceId,
    type: "kw_collect",
    scheduleSlot: slot,
    collectedNew: created,
    collectedTotal: candidates.length,
    source: "rules_v1",
    createdAt: new Date()
  });

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "kw_score",
      scheduleSlot: slot,
      idempotencyKey: `kw_score:${payload.siteId}:${payload.runDate}:slot${slot}${runTag ? `:${runTag}` : ""}`
    }
  });
}
