import OpenAI from "openai";
import { recordLlmUsage } from "./usageMetrics";

let client: OpenAI | null = null;

export type ModerationSummary = {
  checked: boolean;
  blocked: boolean;
  flagged: boolean;
  model: string | null;
  categories: string[];
};

function parseCategories(raw: unknown): string[] {
  const src = (raw ?? {}) as Record<string, unknown>;
  return Object.entries(src)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}

export async function moderateArticleContent(args: { title: string; html: string }): Promise<ModerationSummary> {
  const enabled = process.env.OPENAI_MODERATION_ENABLED !== "0";
  if (!enabled || !process.env.OPENAI_API_KEY) {
    return { checked: false, blocked: false, flagged: false, model: null, categories: [] };
  }

  const text = `${args.title}\n\n${args.html}`.trim();
  if (!text) {
    return { checked: true, blocked: false, flagged: false, model: "omni-moderation-latest", categories: [] };
  }

  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const resp = await client.moderations.create({
    model: "omni-moderation-latest",
    input: text
  });

  const result = Array.isArray(resp.results) ? resp.results[0] : null;
  const flagged = Boolean(result?.flagged);
  const categories = parseCategories(result?.categories);
  void recordLlmUsage({
    task: "moderation",
    model: resp.model ?? "omni-moderation-latest",
    provider: "openai",
    fromCache: false,
    cacheable: false,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0
  }).catch(() => {});
  return {
    checked: true,
    blocked: flagged,
    flagged,
    model: resp.model ?? "omni-moderation-latest",
    categories
  };
}
