import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyTaskPayload } from "../../src/handlers/schema";

const runSet = vi.fn(async () => undefined);
const articleSet = vi.fn(async () => undefined);
const arrayUnion = vi.fn((v: unknown) => ({ __arrayUnion: v }));

vi.mock("../../src/lib/admin", () => {
  return {
    db: () => ({
      doc: (path: string) => {
        if (path.startsWith("taskRuns/")) return { set: runSet };
        if (path.startsWith("articles/")) return { set: articleSet };
        return { set: vi.fn(async () => undefined) };
      }
    }),
    getAdmin: () => ({
      firestore: {
        FieldValue: {
          arrayUnion
        }
      }
    })
  };
});

describe("recordTaskSnapshot", () => {
  beforeEach(() => {
    runSet.mockClear();
    articleSet.mockClear();
    arrayUnion.mockClear();
  });

  it("records taskRuns snapshot for non-article payload", async () => {
    const { recordTaskSnapshot } = await import("../../src/lib/pipelineTimeline");

    const payload: AnyTaskPayload = {
      schemaVersion: "1.0",
      taskType: "kw_score",
      siteId: "site-1",
      traceId: "trace-1",
      idempotencyKey: "k1",
      createdAt: new Date().toISOString(),
      requestedByUid: "u1",
      retryCount: 0,
      runDate: "2026-02-11"
    };

    await recordTaskSnapshot(payload, "running");

    expect(runSet).toHaveBeenCalledTimes(1);
    expect(articleSet).not.toHaveBeenCalled();
  });

  it("records article pipeline timeline when articleId exists", async () => {
    const { recordTaskSnapshot } = await import("../../src/lib/pipelineTimeline");

    const payload: AnyTaskPayload = {
      schemaVersion: "1.0",
      taskType: "article_package",
      siteId: "site-1",
      traceId: "trace-2",
      idempotencyKey: "k2",
      createdAt: new Date().toISOString(),
      requestedByUid: "u1",
      retryCount: 1,
      runDate: "2026-02-11",
      articleId: "a1"
    };

    await recordTaskSnapshot(payload, "failed", { error: "boom", durationMs: 12 });

    expect(runSet).toHaveBeenCalledTimes(1);
    expect(articleSet).toHaveBeenCalledTimes(1);
    expect(arrayUnion).toHaveBeenCalledTimes(2);

    const [articlePayload] = articleSet.mock.calls[0] ?? [];
    expect(articlePayload.pipelineLastTask).toBe("article_package");
    expect(articlePayload.pipelineLastStatus).toBe("failed");
    expect(articlePayload.trace).toBeDefined();
  });
});
