import { bucket, db } from "../../lib/admin";
import { isE2eSkipStorage } from "../../lib/e2eFlags";
import { getGlobalSettings } from "../../lib/globalSettings";
import { nextSpecificWindowUtcMs, nextWindowUtcMs, parseHm } from "../../lib/publishSchedule";
import { moderateArticleContent } from "../../lib/llm/moderation";
import { enqueueTask } from "../../lib/tasks";
import { computeAndStoreInternalLinks } from "../../lib/internalLinks";
import type { ArticlePackagePayload } from "../schema";

type ArticleDoc = {
  titleFinal?: string;
  intent?: string;
  hashtags12?: string[];
  images?: Array<Record<string, unknown>>;
  html?: string;
  clusterId?: string;
};

type SiteDoc = {
  publishMode?: "scheduled" | "manual";
  publishMinIntervalMin?: number;
  publishWindows?: string[];
  nextPublishAt?: string | null;
};

function getScheduleSlot(payload: ArticlePackagePayload): number | null {
  const raw = (payload as unknown as { scheduleSlot?: unknown })?.scheduleSlot;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const slot = Math.floor(raw);
  if (slot < 1 || slot > 6) return null;
  return slot;
}

function parseIsoMs(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

function getRunTag(payload: ArticlePackagePayload) {
  const raw = (payload as unknown as { runTag?: unknown })?.runTag;
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 24);
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : "";
}

function isOpsSmoke(payload: ArticlePackagePayload) {
  // Extra fields are allowed by schema (passthrough). Keep it boolean-only.
  const raw = (payload as unknown as { opsSmoke?: unknown })?.opsSmoke;
  return raw === true;
}

function packageBasePath(siteId: string, articleId: string, runTag: string) {
  // Default run (no runTag) writes to canonical path.
  if (!runTag || runTag === "default") return `sites/${siteId}/articles/${articleId}/package`;
  // Rerun/backfill writes to a separate, explicit path.
  return `sites/${siteId}/articles/${articleId}/package_${runTag}`;
}

export async function articlePackage(payload: ArticlePackagePayload) {
  const { siteId, articleId } = payload;
  const settings = await getGlobalSettings();

  const aSnap = await db().doc(`articles/${articleId}`).get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  const runTag = getRunTag(payload);

  const meta = {
    siteId,
    articleId,
    runDate: payload.runDate,
    traceId: payload.traceId,
    runTag: runTag || null,
    title: a.titleFinal,
    intent: a.intent,
    hashtags12: a.hashtags12,
    images: a.images ?? [],
    createdAt: new Date().toISOString()
  };

  const base = packageBasePath(siteId, articleId, runTag);
  const siteSnap = await db().doc(`sites/${siteId}`).get();
  const site = (siteSnap.data() ?? {}) as SiteDoc;
  const publishMode = site.publishMode ?? settings.pipeline.publishDefault;
  const publishMinIntervalMin = site.publishMinIntervalMin ?? settings.pipeline.publishMinIntervalMin;

  const moderation = await moderateArticleContent({
    title: String(a.titleFinal ?? ""),
    html: String(a.html ?? "")
  });

  if (moderation.blocked) {
    await db()
      .doc(`articles/${articleId}`)
      .set(
        {
          status: "moderation_blocked",
          moderation,
          updatedAt: new Date()
        },
        { merge: true }
      );
    return;
  }

  if (!isE2eSkipStorage()) {
    await bucket().file(`${base}/title.txt`).save(String(a.titleFinal ?? ""), { resumable: false });
    await bucket().file(`${base}/post.html`).save(String(a.html ?? ""), {
      resumable: false,
      contentType: "text/html"
    });
    await bucket().file(`${base}/meta.json`).save(JSON.stringify(meta, null, 2), {
      resumable: false,
      contentType: "application/json"
    });
  }

  let scheduledAtIso: string | null = null;
  if (publishMode === "scheduled") {
    const slot = getScheduleSlot(payload);
    const preferredWindow =
      slot && Array.isArray(site.publishWindows) ? String(site.publishWindows[slot - 1] ?? "").trim() : "";
    const preferredHm = preferredWindow ? parseHm(preferredWindow) : null;

    const siteRef = db().doc(`sites/${siteId}`);
    await db().runTransaction(async (tx) => {
      const sSnap = await tx.get(siteRef);
      const s = (sSnap.data() ?? {}) as SiteDoc;
      const nextMs = parseIsoMs(s.nextPublishAt);

      const baseUtcMs = Date.now() + publishMinIntervalMin * 60 * 1000;
      const effectiveBase = Math.max(baseUtcMs, nextMs ?? 0);

      const windows = Array.isArray(s.publishWindows) ? s.publishWindows : [];
      const pickedUtcMs = preferredHm
        ? nextSpecificWindowUtcMs(effectiveBase, preferredHm)
        : windows.length > 0
          ? nextWindowUtcMs(effectiveBase, windows)
          : effectiveBase;

      scheduledAtIso = new Date(pickedUtcMs).toISOString();
      const nextPublishAt = new Date(pickedUtcMs + publishMinIntervalMin * 60 * 1000).toISOString();
      tx.set(siteRef, { nextPublishAt, updatedAt: new Date() }, { merge: true });
    });
  }

  await db()
    .doc(`articles/${articleId}`)
    .set(
      {
        packagePath: base,
        status: "packaged",
        publishPlan: {
          mode: publishMode,
          minIntervalMin: publishMinIntervalMin,
          scheduledAt: scheduledAtIso
        },
        runTag: runTag || null,
        moderation
      },
      { merge: true }
    );

  // Store internal link candidates for the editor/publisher UI.
  // Keep it best-effort and non-blocking for packaging.
  try {
    await computeAndStoreInternalLinks({
      siteId,
      articleId,
      clusterId: a.clusterId ?? null,
      hashtags12: a.hashtags12 ?? null,
      limit: 4
    });
  } catch {
    // ignore
  }

  // Schedule the actual publish execution as a separate task.
  // Manual mode: do nothing (operator triggers publish from console).
  // Ops smoke: never enqueue publish, even if site is scheduled mode.
  if (isOpsSmoke(payload)) return;
  if (publishMode === "scheduled" && scheduledAtIso) {
    const ms = Date.parse(scheduledAtIso);
    const delaySec = Number.isFinite(ms) ? Math.max(0, Math.floor((ms - Date.now()) / 1000)) : 0;
    const atMin = Number.isFinite(ms) ? Math.floor(ms / 60_000) : 0;
    await enqueueTask({
      queue: "light",
      ignoreAlreadyExists: true,
      scheduleTimeSecFromNow: delaySec,
      payload: {
        ...payload,
        taskType: "publish_execute",
        scheduledAt: scheduledAtIso,
        idempotencyKey: `publish_execute:${siteId}:${payload.runDate}:${articleId}:at${atMin}${
          runTag && runTag !== "default" ? `:${runTag}` : ""
        }`
      }
    });
  }
}
