import { bucket, db } from "../../lib/admin";
import type { PublishExecutePayload } from "../schema";

type ArticleDoc = {
  siteId?: string;
  status?: string;
  titleFinal?: string;
  html?: string;
  packagePath?: string;
  publishPlan?: {
    mode?: "scheduled" | "manual";
    scheduledAt?: string | null;
  };
};

type SiteDoc = {
  platform?: "naver" | "tistory";
  tistory?: {
    blogName?: string;
    visibility?: number; // 0 private, 1 protected, 3 public (Tistory)
    category?: string;
  };
};

function getRuntimeEnv() {
  const v = String(process.env.APP_ENV ?? process.env.INFRA_ENV ?? "").trim().toLowerCase();
  if (v === "prod" || v === "production") return "prod";
  if (v === "staging") return "staging";
  if (v === "dev" || v === "development") return "dev";
  return "dev";
}

function getRunTag(payload: PublishExecutePayload) {
  const raw = (payload as unknown as { runTag?: unknown })?.runTag;
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 24);
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : "";
}

function shouldMarkPublished() {
  // Keep E2E success criteria stable (often asserts status === "packaged").
  if (process.env.TASKS_EXECUTE_INLINE === "1") return false;
  if (process.env.E2E_SKIP_PUBLISH === "1") return false;

  // Allow explicit override.
  if (process.env.PUBLISH_MARK_PUBLISHED === "0") return false;
  return true;
}

async function readTextFromGcs(name: string) {
  const [buf] = await bucket().file(name).download();
  return buf.toString("utf8");
}

async function publishTistory(args: {
  accessToken: string;
  blogName: string;
  title: string;
  html: string;
  visibility: number;
  category?: string;
}) {
  const params = new URLSearchParams();
  params.set("access_token", args.accessToken);
  params.set("output", "json");
  params.set("blogName", args.blogName);
  params.set("title", args.title);
  params.set("content", args.html);
  params.set("visibility", String(args.visibility));
  if (args.category) params.set("category", args.category);

  const res = await fetch("https://www.tistory.com/apis/post/write", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!res.ok) {
    throw new Error(`NON_RETRYABLE:tistory_http_${res.status}:${text.slice(0, 200)}`);
  }

  const status = String(json?.tistory?.status ?? "");
  if (status && status !== "200") {
    throw new Error(`NON_RETRYABLE:tistory_status_${status}:${String(json?.tistory?.error_message ?? "").slice(0, 200)}`);
  }

  const postId = String(json?.tistory?.postId ?? json?.tistory?.post?.id ?? "");
  return { ok: true, provider: "tistory", postId, raw: json };
}

export async function publishExecute(payload: PublishExecutePayload) {
  const { siteId, articleId } = payload;
  const env = getRuntimeEnv();
  const runTag = getRunTag(payload);
  if (env === "prod" && runTag) {
    // Avoid accidentally publishing reruns/backfills in prod without an explicit policy.
    throw new Error("NON_RETRYABLE:publish_runTag_not_allowed");
  }

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;
  if (String(a.siteId ?? "") && String(a.siteId ?? "") !== siteId) throw new Error("NON_RETRYABLE:siteId_mismatch");

  // Only publish after packaging.
  if (a.status !== "packaged" && a.status !== "published") {
    throw new Error(`NON_RETRYABLE:publish_requires_packaged:${String(a.status ?? "")}`);
  }

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

  // In E2E and local runs, skip external publish integration entirely.
  if (process.env.E2E_SKIP_PUBLISH === "1") {
    await aRef.set(
      {
        publishResult: {
          ok: true,
          skipped: true,
          reason: "e2e_skip_publish",
          executedAt: new Date().toISOString()
        }
      },
      { merge: true }
    );
    return;
  }

  const scheduledAt = payload.scheduledAt ?? a.publishPlan?.scheduledAt ?? null;
  const nowIso = new Date().toISOString();

  const siteSnap = await db().doc(`sites/${siteId}`).get();
  const site = (siteSnap.data() ?? {}) as SiteDoc;
  const platform = site.platform ?? "naver";

  // Read from packaged artifacts when possible (source of truth).
  let title = String(a.titleFinal ?? "").trim();
  let html = String(a.html ?? "");
  const packagePath = String(a.packagePath ?? "").trim();
  if (packagePath) {
    try {
      const [t, h] = await Promise.all([
        readTextFromGcs(`${packagePath}/title.txt`),
        readTextFromGcs(`${packagePath}/post.html`)
      ]);
      title = String(t ?? "").trim() || title;
      html = String(h ?? "") || html;
    } catch {
      // fallback to Firestore fields
    }
  }
  if (!title || !html) throw new Error("NON_RETRYABLE:missing_title_or_html");

  let result: Record<string, unknown> = { ok: true, provider: "stub" };
  if (platform === "tistory") {
    const token = String(process.env.TISTORY_ACCESS_TOKEN ?? "").trim();
    const blogName = String(site.tistory?.blogName ?? "").trim();
    const visibilityRaw = site.tistory?.visibility;
    const visibility = typeof visibilityRaw === "number" && Number.isFinite(visibilityRaw) ? visibilityRaw : 3;
    const category = String(site.tistory?.category ?? "").trim() || undefined;

    if (!token) throw new Error("NON_RETRYABLE:missing_tistory_access_token");
    if (!blogName) throw new Error("NON_RETRYABLE:missing_tistory_blog_name");

    result = await publishTistory({ accessToken: token, blogName, title, html, visibility, category });
  } else {
    // Naver blog: requires separate integration (often not officially supported); keep disabled by default.
    const provider = String(process.env.PUBLISH_PROVIDER ?? "").trim() || (env === "prod" ? "disabled" : "stub");
    if (provider === "disabled") {
      throw new Error("NON_RETRYABLE:publish_provider_disabled");
    }
    result = { ok: true, provider, note: "stub_publish_execute" };
  }

  await db().doc(`publishRuns/${payload.idempotencyKey}`).set(
    {
      siteId,
      articleId,
      status: "success",
      provider: String(result.provider ?? platform),
      platform,
      result,
      scheduledAt,
      executedAt: nowIso,
      traceId: payload.traceId,
      runDate: payload.runDate,
      createdAt: new Date()
    },
    { merge: true }
  );

  const publishResult = { ...result, scheduledAt, executedAt: nowIso };
  if (shouldMarkPublished()) {
    await aRef.set({ status: "published", publishedAt: nowIso, publishResult }, { merge: true });
    return;
  }
  await aRef.set({ publishResult }, { merge: true });
}
