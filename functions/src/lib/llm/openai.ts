import OpenAI from "openai";
import type { z } from "zod";
import { commitCache, getOrReserveCache, makeCacheKey } from "./cache";
import { estimateCostUsd, recordLlmUsage } from "./usageMetrics";

let client: OpenAI | null = null;

export type StructuredTask = "title" | "body" | "qaFix";

export const MODEL_DEFAULT = process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4.1-mini";
export const MODEL_QUALITY = process.env.OPENAI_MODEL_QUALITY ?? "gpt-4.1";

type CallArgs<TOut> = {
  task: StructuredTask;
  normalizedRequest: unknown;
  schemaVersion: string;
  promptVersion: string;
  model?: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  system: string;
  user: string;
  zod: z.ZodType<TOut>;
  ttlDays?: number;
};

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getClient() {
  if (client) return client;
  client = new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") });
  return client;
}

function extractUsage(usage: unknown) {
  const u = (usage ?? {}) as Record<string, unknown>;
  return {
    input_tokens: typeof u.input_tokens === "number" ? u.input_tokens : undefined,
    output_tokens: typeof u.output_tokens === "number" ? u.output_tokens : undefined,
    total_tokens: typeof u.total_tokens === "number" ? u.total_tokens : undefined
  };
}

export async function callOpenAiStructuredCached<TOut>(args: CallArgs<TOut>) {
  const model = args.model ?? MODEL_DEFAULT;
  const { hash } = makeCacheKey({
    normalizedRequest: args.normalizedRequest,
    model,
    schemaVersion: args.schemaVersion,
    promptVersion: args.promptVersion
  });

  const { hit, ref, cur } = await getOrReserveCache(hash, {
    task: args.task,
    model,
    schemaVersion: args.schemaVersion,
    promptVersion: args.promptVersion,
    request: args.normalizedRequest
  });

  if (hit && cur?.response) {
    const out = args.zod.parse(cur.response);
    void recordLlmUsage({
      task: args.task,
      model,
      provider: "openai",
      fromCache: true,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0
    }).catch(() => {});
    return { out, cacheHash: hash, usage: cur.usage, fromCache: true as const };
  }

  const resp = await getClient().responses.create({
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: args.system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: args.user }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        strict: true,
        schema: args.jsonSchema
      }
    },
    temperature: 0.2
  });

  const raw = typeof resp.output_text === "string" ? resp.output_text : "";
  if (!raw) throw new Error("No output_text from OpenAI response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse JSON output_text");
  }

  const out = args.zod.parse(parsed);
  const usage = extractUsage((resp as { usage?: unknown }).usage);
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
  const estimatedCost = estimateCostUsd({ model, inputTokens, outputTokens });
  await commitCache(ref, out, usage, args.ttlDays ?? 30);
  void recordLlmUsage({
    task: args.task,
    model,
    provider: "openai",
    fromCache: false,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: estimatedCost
  }).catch(() => {});
  return { out, cacheHash: hash, usage, fromCache: false as const };
}
