import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { db } from "../lib/admin";
import { getTaskSecret } from "../lib/env";
import { kstDayKey } from "../../../packages/shared/kstDayKey";
import { routeTask } from "./taskRouter";

function tsMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.toDate === "function") {
      try {
        return (o.toDate as () => Date)().getTime();
      } catch {
        return null;
      }
    }
    if (typeof o.seconds === "number") return o.seconds * 1000;
    if (typeof o._seconds === "number") return o._seconds * 1000;
  }
  return null;
}

function requireOpsAuth(req: Request, res: Response) {
  const got = String(req.get("X-Ops-Secret") ?? req.get("X-Task-Secret") ?? "").trim();
  const want = getTaskSecret();
  if (!want || got !== want) {
    res.status(403).json({ ok: false, lastErrorCode: "forbidden", lastErrorMessage: "forbidden" });
    return false;
  }
  return true;
}

function isIsoDayKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const opsHealth = onRequest(async (req, res) => {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, lastErrorCode: "method_not_allowed", lastErrorMessage: "method_not_allowed" });
    return;
  }

  const now = Date.now();
  const runDate = kstDayKey(new Date());
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];
  const out: Record<string, unknown> = {
    ok: true,
    nowIso: new Date(now).toISOString(),
    runDate,
    lastErrorCode: null,
    lastErrorMessage: null,
    warnings: [],
    checks: {
      firestoreConnectivity: false,
      queueLatencyMs: null,
      lastPipelineSuccessIso: null,
      costDailyLatestExists: false
    }
  };

  try {
    // Read-only op to validate Firestore connectivity/permissions.
    await db().doc("_ops/health").get();
    (out.checks as Record<string, unknown>).firestoreConnectivity = true;
  } catch (err: unknown) {
    (out.checks as Record<string, unknown>).firestoreConnectivity = false;
    out.ok = false;
    errors.push({ code: "firestore_connectivity_failed", message: String((err as { message?: unknown })?.message ?? err) });
  }

  try {
    const costSnap = await db().doc(`costDaily/${runDate}`).get();
    const exists = costSnap.exists;
    (out.checks as Record<string, unknown>).costDailyLatestExists = exists;
    if (!exists) warnings.push({ code: "missing_costDaily_latest", message: `missing costDaily/${runDate}` });
  } catch (err: unknown) {
    (out.checks as Record<string, unknown>).costDailyLatestExists = false;
    warnings.push({ code: "costDaily_read_failed", message: String((err as { message?: unknown })?.message ?? err) });
  }

  try {
    // Avoid requiring composite indexes: no orderBy+where combination.
    const queuedSnap = await db().collection("taskRuns").where("status", "==", "queued").limit(50).get();
    let maxAgeMs: number | null = null;
    for (const d of queuedSnap.docs) {
      const qAt = tsMillis((d.data() as Record<string, unknown>).queuedAt);
      if (qAt == null) continue;
      const age = Math.max(0, now - qAt);
      maxAgeMs = maxAgeMs == null ? age : Math.max(maxAgeMs, age);
    }
    (out.checks as Record<string, unknown>).queueLatencyMs = maxAgeMs;
  } catch (err: unknown) {
    (out.checks as Record<string, unknown>).queueLatencyMs = null;
    errors.push({ code: "queue_latency_read_failed", message: String((err as { message?: unknown })?.message ?? err) });
  }

  try {
    // Avoid where+orderBy index requirements by scanning recent docs.
    const snap = await db().collection("pipelineRuns").orderBy("updatedAt", "desc").limit(30).get();
    let lastIso: string | null = null;
    for (const d of snap.docs) {
      const row = (d.data() ?? {}) as { state?: unknown; endedAt?: unknown; updatedAt?: unknown };
      if (row.state !== "succeeded") continue;
      const ms = tsMillis(row.endedAt) ?? tsMillis(row.updatedAt);
      if (ms != null) {
        lastIso = new Date(ms).toISOString();
        break;
      }
    }
    (out.checks as Record<string, unknown>).lastPipelineSuccessIso = lastIso;
    if (!lastIso) out.ok = false;
    if (!lastIso) errors.push({ code: "missing_last_pipeline_success", message: "no recent pipelineRuns with state=succeeded" });
  } catch (err: unknown) {
    (out.checks as Record<string, unknown>).lastPipelineSuccessIso = null;
    out.ok = false;
    errors.push({ code: "pipelineRuns_read_failed", message: String((err as { message?: unknown })?.message ?? err) });
  }

  out.warnings = warnings;
  if (out.ok !== true) {
    const first = errors[0] ?? { code: "unknown", message: "unknown" };
    out.lastErrorCode = first.code;
    out.lastErrorMessage = first.message;
    out.errors = errors;
  }

  res.status(200).json(out);
});

export const opsSmoke = onRequest(async (req, res) => {
  if (!requireOpsAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, lastErrorCode: "method_not_allowed", lastErrorMessage: "method_not_allowed" });
    return;
  }

  const siteId = String(req.query.siteId ?? process.env.OPS_SMOKE_SITE_ID ?? "").trim();
  const runDateRaw = String(req.query.runDate ?? "").trim();
  const runDate = runDateRaw ? runDateRaw : kstDayKey(new Date());
  if (!siteId) {
    res
      .status(400)
      .json({
        ok: false,
        lastErrorCode: "missing_siteId",
        lastErrorMessage: "missing_siteId",
        hint: "set ?siteId=... or functions env OPS_SMOKE_SITE_ID"
      });
    return;
  }
  if (!isIsoDayKey(runDate)) {
    res.status(400).json({ ok: false, lastErrorCode: "invalid_runDate", lastErrorMessage: "invalid_runDate", runDate });
    return;
  }

  const traceId = `ops-smoke-${randomUUID()}`;
  const articleId = `ops_smoke_${siteId}_${runDate}_${Date.now()}`.replace(/[^\w-]/g, "_").slice(0, 180);
  const nowIso = new Date().toISOString();

  // Create a minimal article doc that can be packaged without LLM calls (empty title/html => moderation short-circuit).
  await db()
    .doc(`articles/${articleId}`)
    .set(
      {
        siteId,
        runDate,
        status: "ready",
        titleFinal: "",
        html: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        ops: { kind: "smoke", traceId, createdAt: nowIso }
      },
      { merge: true }
    );

  // 1) Dry-run task execution via the real router (writes taskRuns + validates locks, etc).
  await routeTask({
    schemaVersion: "1.0",
    taskType: "analyzer_daily",
    siteId,
    traceId,
    idempotencyKey: `analyzer_daily:${siteId}:${runDate}:ops_smoke`,
    createdAt: nowIso,
    requestedByUid: "OPS",
    retryCount: 0,
    runDate
  });

  // 2) Packaging path validation (no publish enqueue, even if site is scheduled mode).
  await routeTask({
    schemaVersion: "1.0",
    taskType: "article_package",
    siteId,
    articleId,
    traceId,
    idempotencyKey: `article_package:${siteId}:${runDate}:${articleId}:ops_smoke`,
    createdAt: nowIso,
    requestedByUid: "OPS",
    retryCount: 0,
    runDate,
    opsSmoke: true,
    scheduleSlot: 1
  });

  const aSnap = await db().doc(`articles/${articleId}`).get();
  const a = (aSnap.data() ?? {}) as { status?: unknown; packagePath?: unknown };
  const packaged = a.status === "packaged";
  const packagePath = typeof a.packagePath === "string" ? a.packagePath : null;
  if (!packaged) {
    res.status(500).json({
      ok: false,
      lastErrorCode: "smoke_failed_article_not_packaged",
      lastErrorMessage: "smoke_failed_article_not_packaged",
      articleId,
      status: a.status ?? null
    });
    return;
  }

  const costSnap = await db().doc(`costDaily/${runDate}`).get();
  if (!costSnap.exists) {
    res.status(500).json({
      ok: false,
      lastErrorCode: "smoke_failed_missing_costDaily",
      lastErrorMessage: "smoke_failed_missing_costDaily",
      runDate
    });
    return;
  }

  res.status(200).json({
    ok: true,
    siteId,
    runDate,
    traceId,
    articleId,
    packagePath,
    costDailyExists: true
  });
});
