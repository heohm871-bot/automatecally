import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { estimateCostUsd } from "./llm/usageMetrics";

type LlmUsageShape = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

function safeDocId(raw: string) {
  // Firestore doc IDs cannot contain "/" and some clients get unhappy with very long ids.
  return String(raw ?? "").replace(/\//g, "_").slice(0, 180) || "unknown";
}

function normInt(n: unknown) {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normNum(n: unknown) {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;
}

export async function recordArticleLlmCost(args: {
  siteId: string;
  runDate: string; // KST day key (YYYY-MM-DD) used across the pipeline
  articleId: string;
  cacheHash: string;
  model: string;
  usage?: LlmUsageShape | null;
}) {
  const dayKey = String(args.runDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const cacheHash = String(args.cacheHash ?? "").trim();
  if (!cacheHash) return;

  const inputTokens = normInt(args.usage?.input_tokens);
  const outputTokens = normInt(args.usage?.output_tokens);
  const totalTokens = normInt(args.usage?.total_tokens) || inputTokens + outputTokens;
  const estimatedCost = normNum(estimateCostUsd({ model: args.model, inputTokens, outputTokens }));
  const countedCall = totalTokens > 0 ? 1 : 0;

  const articleRef = db().doc(`articles/${safeDocId(args.articleId)}`);
  const dailyRef = db().doc(`costDaily/${safeDocId(dayKey)}`);
  const siteDailyRef = db().doc(`costDaily/${safeDocId(dayKey)}/sites/${safeDocId(args.siteId)}`);

  await db().runTransaction(async (tx) => {
    const aSnap = await tx.get(articleRef);
    const data = (aSnap.data() ?? {}) as {
      llmCostAccounting?: { cacheHashes?: unknown };
    };
    const existing = Array.isArray(data.llmCostAccounting?.cacheHashes) ? data.llmCostAccounting?.cacheHashes : [];
    if (existing.includes(cacheHash)) return;

    const now = new Date();
    const inc = (v: number) => FieldValue.increment(v);

    tx.set(
      articleRef,
      {
        estimatedTokens: inc(totalTokens),
        estimatedCostUsd: inc(estimatedCost),
        llmCallCount: inc(countedCall),
        llmCostAccounting: { cacheHashes: FieldValue.arrayUnion(cacheHash) },
        estimatedUpdatedAt: now
      },
      { merge: true }
    );

    tx.set(
      dailyRef,
      {
        dayKey,
        updatedAt: now,
        estimatedTokens: inc(totalTokens),
        estimatedCostUsd: inc(estimatedCost),
        llmCallCount: inc(countedCall)
      },
      { merge: true }
    );

    tx.set(
      siteDailyRef,
      {
        dayKey,
        siteId: args.siteId,
        updatedAt: now,
        estimatedTokens: inc(totalTokens),
        estimatedCostUsd: inc(estimatedCost),
        llmCallCount: inc(countedCall)
      },
      { merge: true }
    );
  });
}

