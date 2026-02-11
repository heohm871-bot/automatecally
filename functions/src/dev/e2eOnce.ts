import { routeTask } from "../handlers/taskRouter";
import type { KwScorePayload } from "../handlers/schema";
import { cleanupE2eFixture, seedE2eFixture } from "./e2eFixture";
import { db } from "../lib/admin";
import { E2eRunFailureSchema, E2eRunSuccessSchema } from "./e2eRunSchema";

class E2eError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function stepWithTimeout<T>(label: string, promise: Promise<T>, timeoutMs: number) {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new E2eError("E2E_STEP_TIMEOUT", `${label} exceeded ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
    return { result, durationMs: Date.now() - startedAt };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run() {
  const startedAtMs = Date.now();
  const runId = process.env.E2E_RUN_ID ?? `run-${startedAtMs}`;

  process.env.TASKS_EXECUTE_INLINE = "1";
  process.env.E2E_SKIP_STORAGE = "1";
  process.env.INLINE_TASK_TIMEOUT_MS = process.env.INLINE_TASK_TIMEOUT_MS ?? "45000";
  const stepTimeoutMs = Number(process.env.E2E_STEP_TIMEOUT_MS ?? 60_000);

  const stepStats: Array<{ step: string; durationMs: number }> = [];

  let articleId: string | null = null;
  let status: string | null = null;
  let qaPass: boolean | null = null;
  let packagePath: string | null = null;
  let traceId = process.env.E2E_TRACE_ID ?? `trace-${startedAtMs}`;
  let runDate = process.env.E2E_RUN_DATE ?? new Date().toISOString().slice(0, 10);
  let retryCount = 0;

  try {
    const seeded = await stepWithTimeout(
      "seed",
      seedE2eFixture({
        siteId: process.env.E2E_SITE_ID,
        keywordId: process.env.E2E_KEYWORD_ID,
        traceId: process.env.E2E_TRACE_ID,
        runDate: process.env.E2E_RUN_DATE,
        tag: process.env.E2E_TAG
      }),
      stepTimeoutMs
    );
    const fixture = seeded.result;
    traceId = fixture.traceId;
    runDate = fixture.runDate;
    stepStats.push({ step: "seed", durationMs: seeded.durationMs });

    const payload: KwScorePayload = {
      schemaVersion: "1.0",
      taskType: "kw_score",
      siteId: fixture.siteId,
      traceId: fixture.traceId,
      idempotencyKey: `kw_score:${fixture.siteId}:${fixture.runDate}:${fixture.tag}`,
      createdAt: new Date().toISOString(),
      requestedByUid: "E2E",
      retryCount: 0,
      runDate: fixture.runDate
    };
    retryCount = payload.retryCount;

    const routed = await stepWithTimeout("routeTask(kw_score)", routeTask(payload), stepTimeoutMs);
    stepStats.push({ step: "routeTask(kw_score)", durationMs: routed.durationMs });

    const queried = await stepWithTimeout(
      "queryArticle",
      db()
        .collection("articles")
        .where("siteId", "==", fixture.siteId)
        .where("keywordId", "==", fixture.keywordId)
        .limit(10)
        .get(),
      stepTimeoutMs
    );
    stepStats.push({ step: "queryArticle", durationMs: queried.durationMs });

    const articleSnap = queried.result;
    if (articleSnap.empty) {
      throw new E2eError("E2E_ARTICLE_NOT_CREATED", "E2E failed: article was not created");
    }

    const articleDoc = articleSnap.docs[0];
    articleId = articleDoc.id;

    const article = articleDoc.data() as { packagePath?: string; qa?: { pass?: boolean }; status?: string };
    status = article.status ?? null;
    qaPass = article.qa?.pass ?? null;
    packagePath = article.packagePath ?? null;

    if (status !== "packaged") {
      throw new E2eError(
        "E2E_STATUS_NOT_PACKAGED",
        `E2E failed: expected articles/${articleId}.status to be packaged but got ${status ?? "null"}`
      );
    }
    if (!packagePath) {
      throw new E2eError("E2E_PACKAGE_MISSING", "E2E failed: packagePath missing");
    }
    if (process.env.E2E_REQUIRE_QA_PASS === "1" && qaPass !== true) {
      throw new E2eError("E2E_QA_NOT_PASS", "E2E failed: QA pass is required but qaPass is not true");
    }

    if (process.env.E2E_CLEANUP === "1") {
      const cleaned = await stepWithTimeout(
        "cleanup",
        cleanupE2eFixture({
          siteId: fixture.siteId,
          keywordId: fixture.keywordId,
          tag: fixture.tag
        }),
        stepTimeoutMs
      );
      stepStats.push({ step: "cleanup", durationMs: cleaned.durationMs });
    }

    const success = E2eRunSuccessSchema.parse({
      ok: true,
      code: "E2E_OK",
      runId,
      siteId: fixture.siteId,
      keywordId: fixture.keywordId,
      traceId,
      runDate,
      retryCount,
      articleId,
      status,
      qaPass,
      packagePath,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      stepStats
    });

    const taskRunsSnap = await db().collection("taskRuns").where("traceId", "==", traceId).limit(100).get();
    const taskRunsSample = taskRunsSnap.docs
      .map((d) => {
        const data = d.data() as Record<string, unknown>;
        const startedAt =
          typeof data.startedAt === "object" && data.startedAt && "toDate" in data.startedAt
            ? (data.startedAt as { toDate: () => Date }).toDate().toISOString()
            : null;
        const updatedAt =
          typeof data.updatedAt === "object" && data.updatedAt && "toDate" in data.updatedAt
            ? (data.updatedAt as { toDate: () => Date }).toDate().toISOString()
            : null;
        return {
          idempotencyKey: String(data.idempotencyKey ?? d.id),
          taskType: typeof data.taskType === "string" ? data.taskType : undefined,
          status: typeof data.status === "string" ? data.status : undefined,
          startedAt,
          updatedAt,
          durationMs: typeof data.durationMs === "number" ? data.durationMs : null,
          error: typeof data.error === "string" ? data.error : null
        };
      })
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .slice(0, 20);

    await db().doc(`e2eRuns/${runId}`).set({ ...success, taskRunsSample });
    console.log(JSON.stringify({ ...success, taskRunsSample }, null, 2));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "E2E_UNKNOWN";
    const message = String((err as { message?: string })?.message ?? err);

    const failure = E2eRunFailureSchema.parse({
      ok: false,
      code,
      message,
      runId,
      siteId: process.env.E2E_SITE_ID ?? "site-e2e",
      keywordId: process.env.E2E_KEYWORD_ID ?? "unknown",
      traceId,
      runDate,
      retryCount,
      articleId,
      status,
      qaPass,
      packagePath,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      stepStats
    });

    await db().doc(`e2eRuns/${runId}`).set(failure).catch(() => undefined);
    console.error(JSON.stringify({ ok: false, code: failure.code, message: failure.message }, null, 2));
    process.exit(1);
  }
}

void run();
