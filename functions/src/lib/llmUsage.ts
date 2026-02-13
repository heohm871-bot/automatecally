import type { CapsSettings } from "./globalSettings";

export type LlmUsage = {
  title: number;
  body: number;
  qaFix: number;
};

export type LlmKind = keyof LlmUsage;

export function getLlmUsage(src: unknown): LlmUsage {
  const raw = (src ?? {}) as Partial<LlmUsage>;
  return {
    title: typeof raw.title === "number" && raw.title > 0 ? raw.title : 0,
    body: typeof raw.body === "number" && raw.body > 0 ? raw.body : 0,
    qaFix: typeof raw.qaFix === "number" && raw.qaFix > 0 ? raw.qaFix : 0
  };
}

export function canUseLlm(kind: LlmKind, usage: LlmUsage, caps: CapsSettings) {
  if (kind === "title") return usage.title < caps.titleLLMMax;
  if (kind === "body") return usage.body < caps.bodyLLMMax;
  return usage.qaFix < caps.qaFixMax;
}

export function bumpLlmUsage(usage: LlmUsage, kind: LlmKind): LlmUsage {
  const next = { ...usage };
  if (kind === "title") next.title += 1;
  else if (kind === "body") next.body += 1;
  else next.qaFix += 1;
  return next;
}
