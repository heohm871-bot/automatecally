import { db } from "../../lib/admin";
import type { PublishExecutePayload } from "../schema";

type ArticleDoc = {
  status?: string;
  publishPlan?: {
    mode?: "scheduled" | "manual";
    scheduledAt?: string | null;
  };
};

function getRuntimeEnv() {
  const v = String(process.env.APP_ENV ?? process.env.INFRA_ENV ?? "").trim().toLowerCase();
  if (v === "prod" || v === "production") return "prod";
  if (v === "staging") return "staging";
  if (v === "dev" || v === "development") return "dev";
  return "dev";
}

function shouldMarkPublished() {
  // Keep E2E success criteria stable (often asserts status === "packaged").
  if (process.env.TASKS_EXECUTE_INLINE === "1") return false;
  if (process.env.E2E_SKIP_PUBLISH === "1") return false;

  // Allow explicit override.
  if (process.env.PUBLISH_MARK_PUBLISHED === "0") return false;
  return true;
}

export async function publishExecute(payload: PublishExecutePayload) {
  const { siteId, articleId } = payload;
  const env = getRuntimeEnv();

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  const mode = a.publishPlan?.mode ?? "scheduled";
  if (mode === "manual") {
    await aRef.set(
      {
        publishResult: {
          ok: true,
          skipped: true,
          reason: "manual_mode",
          executedAt: new Date().toISOString()
        }
      },
      { merge: true }
    );
    return;
  }

  const scheduledAt = payload.scheduledAt ?? a.publishPlan?.scheduledAt ?? null;
  const provider = String(process.env.PUBLISH_PROVIDER ?? "").trim() || (env === "prod" ? "disabled" : "stub");
  if (provider === "disabled") {
    throw new Error("NON_RETRYABLE:publish_provider_disabled");
  }

  // TODO: Integrate real platform publisher (Naver/Tistory) here.
  // For now: record an execution marker, and optionally mark published.
  const nowIso = new Date().toISOString();
  await db().doc(`publishRuns/${payload.idempotencyKey}`).set(
    {
      siteId,
      articleId,
      status: "success",
      provider,
      scheduledAt,
      executedAt: nowIso,
      traceId: payload.traceId,
      runDate: payload.runDate,
      createdAt: new Date()
    },
    { merge: true }
  );

  if (shouldMarkPublished()) {
    await aRef.set(
      {
        status: "published",
        publishedAt: nowIso,
        publishResult: { ok: true, provider, scheduledAt, executedAt: nowIso }
      },
      { merge: true }
    );
    return;
  }

  await aRef.set(
    {
      publishResult: { ok: true, provider, scheduledAt, executedAt: nowIso }
    },
    { merge: true }
  );
}

