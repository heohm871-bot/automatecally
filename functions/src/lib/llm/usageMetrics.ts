import { FieldValue } from "firebase-admin/firestore";
import { db } from "../admin";

const PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 }
};

function sanitizeFieldKey(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}

function nowKeys(now = new Date()) {
  const iso = now.toISOString();
  return { dayKey: iso.slice(0, 10), monthKey: iso.slice(0, 7) };
}

export function estimateCostUsd(args: { model: string; inputTokens: number; outputTokens: number }) {
  const pricing = PRICING_USD_PER_1M[args.model];
  if (!pricing) return 0;
  return (args.inputTokens * pricing.input + args.outputTokens * pricing.output) / 1_000_000;
}

export async function recordLlmUsage(args: {
  task: string;
  model: string;
  provider?: string;
  fromCache: boolean;
  cacheable?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}) {
  const provider = args.provider ?? "openai";
  const modelKey = sanitizeFieldKey(args.model || "unknown");
  const taskKey = sanitizeFieldKey(args.task || "unknown");
  const inputTokens = Math.max(0, Math.floor(args.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(args.outputTokens ?? 0));
  const totalTokens = Math.max(0, Math.floor(args.totalTokens ?? inputTokens + outputTokens));
  const estimatedCostUsd = typeof args.estimatedCostUsd === "number" ? Math.max(0, args.estimatedCostUsd) : 0;
  const cacheable = args.cacheable !== false;
  const { dayKey, monthKey } = nowKeys();

  const inc = (value: number) => FieldValue.increment(value);
  const base: Record<string, unknown> = {
    dayKey,
    monthKey,
    updatedAt: new Date(),
    "totals.calls": inc(1),
    "totals.cacheHits": inc(cacheable ? (args.fromCache ? 1 : 0) : 0),
    "totals.cacheMisses": inc(cacheable ? (args.fromCache ? 0 : 1) : 0),
    "totals.inputTokens": inc(inputTokens),
    "totals.outputTokens": inc(outputTokens),
    "totals.totalTokens": inc(totalTokens),
    "totals.estimatedCostUsd": inc(estimatedCostUsd),
    [`byTask.${taskKey}.calls`]: inc(1),
    [`byTask.${taskKey}.cacheHits`]: inc(cacheable ? (args.fromCache ? 1 : 0) : 0),
    [`byTask.${taskKey}.cacheMisses`]: inc(cacheable ? (args.fromCache ? 0 : 1) : 0),
    [`byTask.${taskKey}.inputTokens`]: inc(inputTokens),
    [`byTask.${taskKey}.outputTokens`]: inc(outputTokens),
    [`byTask.${taskKey}.totalTokens`]: inc(totalTokens),
    [`byTask.${taskKey}.estimatedCostUsd`]: inc(estimatedCostUsd),
    [`byModel.${modelKey}.calls`]: inc(1),
    [`byModel.${modelKey}.cacheHits`]: inc(cacheable ? (args.fromCache ? 1 : 0) : 0),
    [`byModel.${modelKey}.cacheMisses`]: inc(cacheable ? (args.fromCache ? 0 : 1) : 0),
    [`byModel.${modelKey}.inputTokens`]: inc(inputTokens),
    [`byModel.${modelKey}.outputTokens`]: inc(outputTokens),
    [`byModel.${modelKey}.totalTokens`]: inc(totalTokens),
    [`byModel.${modelKey}.estimatedCostUsd`]: inc(estimatedCostUsd),
    [`byProvider.${sanitizeFieldKey(provider)}.calls`]: inc(1)
  };

  await Promise.all([
    db()
      .doc(`usageDaily/${dayKey}`)
      .set(base, { merge: true }),
    db()
      .doc(`usageMonthly/${monthKey}`)
      .set(base, { merge: true })
  ]);
}
