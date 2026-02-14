import { describe, expect, test, vi, beforeEach } from "vitest";

type Snap = { exists: boolean; data(): Record<string, unknown> };

function makeFakeDb(initial: Record<string, Record<string, unknown>>) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(initial));

  const doc = (path: string) => {
    return {
      async get(): Promise<Snap> {
        const data = store.get(path);
        return { exists: Boolean(data), data: () => data ?? {} };
      }
    };
  };

  const runTransaction = async <T>(fn: (tx: any) => Promise<T>) => {
    const tx = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: Record<string, unknown>) => {
        const path = (ref as any).__path as string;
        const cur = store.get(path) ?? {};
        const next = { ...cur };
        for (const [k, v] of Object.entries(data)) {
          // Support dotted paths used by budgets.ts.
          if (k.includes(".")) {
            const [p0, p1] = k.split(".");
            const obj = { ...(next[p0] as any) };
            (obj as any)[p1] = v;
            (next as any)[p0] = obj;
          } else {
            (next as any)[k] = v;
          }
        }
        store.set(path, next);
      }
    };
    return fn(tx);
  };

  const db = () => ({
    doc: (path: string) => Object.assign(doc(path), { __path: path }),
    runTransaction
  });

  return { db, store };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("budgetCheckAndMaybeAlert", () => {
  test("sends threshold alert once (dedup via alertsSent)", async () => {
    const { db } = makeFakeDb({
      "costDaily/2026-02-14": { estimatedCostUsd: 85 },
      "costDaily/2026-02-14/sites/site-a": { estimatedCostUsd: 10 }
    });

    vi.doMock("../../src/lib/admin", () => ({ db }));
    const mod = await import("../../src/lib/budgets");

    const budgets = { dailyUsdTotal: 100, dailyUsdPerSite: 0, alertThresholds: [0.8, 1.0], alertWebhookUrl: "https://example.com" };

    await mod.budgetCheckAndMaybeAlert({ siteId: "site-a", runDate: "2026-02-14", budgets, taskType: "body_generate" });
    await mod.budgetCheckAndMaybeAlert({ siteId: "site-a", runDate: "2026-02-14", budgets, taskType: "body_generate" });

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });
});
