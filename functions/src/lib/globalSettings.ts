import { db } from "./admin";
import { GROWTH_V1, type GrowthConfig } from "../../../packages/shared/scoringConfig";

export type PipelineSettings = {
  enqueueJitterSecMin: number;
  enqueueJitterSecMax: number;
  retrySameDayMax: number;
  retryDelaySec: number;
  publishDefault: "scheduled" | "manual";
  publishMinIntervalMin: number;
};

export type CapsSettings = {
  titleLLMMax: number;
  bodyLLMMax: number;
  qaFixMax: number;
  generateImagesOnlyOnQaPass: boolean;
};

export type GlobalSettings = {
  pipeline: PipelineSettings;
  caps: CapsSettings;
  growth: GrowthConfig;
};

const DEFAULT_SETTINGS: GlobalSettings = {
  pipeline: {
    enqueueJitterSecMin: 120,
    enqueueJitterSecMax: 300,
    retrySameDayMax: 1,
    retryDelaySec: 1800,
    publishDefault: "scheduled",
    publishMinIntervalMin: 60
  },
  caps: {
    titleLLMMax: 1,
    bodyLLMMax: 1,
    qaFixMax: 1,
    generateImagesOnlyOnQaPass: true
  },
  growth: GROWTH_V1
};

let cacheValue: GlobalSettings | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30_000;

function toNumber(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function toBoolean(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function toPublishDefault(v: unknown, fallback: "scheduled" | "manual") {
  return v === "scheduled" || v === "manual" ? v : fallback;
}

function mergeSettings(raw: unknown): GlobalSettings {
  const src = (raw ?? {}) as Record<string, unknown>;
  const pipeline = (src.pipeline ?? {}) as Record<string, unknown>;
  const caps = (src.caps ?? {}) as Record<string, unknown>;
  const growth = (src.growth ?? {}) as Record<string, unknown>;

  return {
    pipeline: {
      enqueueJitterSecMin: Math.max(0, toNumber(pipeline.enqueueJitterSecMin, DEFAULT_SETTINGS.pipeline.enqueueJitterSecMin)),
      enqueueJitterSecMax: Math.max(
        toNumber(pipeline.enqueueJitterSecMin, DEFAULT_SETTINGS.pipeline.enqueueJitterSecMin),
        toNumber(pipeline.enqueueJitterSecMax, DEFAULT_SETTINGS.pipeline.enqueueJitterSecMax)
      ),
      retrySameDayMax: Math.max(0, Math.floor(toNumber(pipeline.retrySameDayMax, DEFAULT_SETTINGS.pipeline.retrySameDayMax))),
      retryDelaySec: Math.max(0, Math.floor(toNumber(pipeline.retryDelaySec, DEFAULT_SETTINGS.pipeline.retryDelaySec))),
      publishDefault: toPublishDefault(pipeline.publishDefault, DEFAULT_SETTINGS.pipeline.publishDefault),
      publishMinIntervalMin: Math.max(
        0,
        Math.floor(toNumber(pipeline.publishMinIntervalMin, DEFAULT_SETTINGS.pipeline.publishMinIntervalMin))
      )
    },
    caps: {
      titleLLMMax: Math.max(0, Math.floor(toNumber(caps.titleLLMMax, DEFAULT_SETTINGS.caps.titleLLMMax))),
      bodyLLMMax: Math.max(0, Math.floor(toNumber(caps.bodyLLMMax, DEFAULT_SETTINGS.caps.bodyLLMMax))),
      qaFixMax: Math.max(0, Math.floor(toNumber(caps.qaFixMax, DEFAULT_SETTINGS.caps.qaFixMax))),
      generateImagesOnlyOnQaPass: toBoolean(
        caps.generateImagesOnlyOnQaPass,
        DEFAULT_SETTINGS.caps.generateImagesOnlyOnQaPass
      )
    },
    growth: {
      minTrend30: toNumber(growth.minTrend30, DEFAULT_SETTINGS.growth.minTrend30),
      minTrend7: toNumber(growth.minTrend7, DEFAULT_SETTINGS.growth.minTrend7),
      hotMomentumMin: toNumber(growth.hotMomentumMin, DEFAULT_SETTINGS.growth.hotMomentumMin),
      evergreenStabilityMin: toNumber(growth.evergreenStabilityMin, DEFAULT_SETTINGS.growth.evergreenStabilityMin),
      lowBlogDocsMax: toNumber(growth.lowBlogDocsMax, DEFAULT_SETTINGS.growth.lowBlogDocsMax),
      lowCompRatioMax: toNumber(growth.lowCompRatioMax, DEFAULT_SETTINGS.growth.lowCompRatioMax),
      midBlogDocsMax: toNumber(growth.midBlogDocsMax, DEFAULT_SETTINGS.growth.midBlogDocsMax),
      midCompRatioMax: toNumber(growth.midCompRatioMax, DEFAULT_SETTINGS.growth.midCompRatioMax),
      hardBlogDocsMax: toNumber(growth.hardBlogDocsMax, DEFAULT_SETTINGS.growth.hardBlogDocsMax),
      hardCompRatioMax: toNumber(growth.hardCompRatioMax, DEFAULT_SETTINGS.growth.hardCompRatioMax),
      midCompetitionShare: toNumber(growth.midCompetitionShare, DEFAULT_SETTINGS.growth.midCompetitionShare)
    }
  };
}

export async function getGlobalSettings(force = false): Promise<GlobalSettings> {
  const now = Date.now();
  if (!force && cacheValue && now - cacheAt < CACHE_TTL_MS) return cacheValue;

  try {
    const snap = await db().doc("settings/global").get();
    const merged = mergeSettings(snap.exists ? snap.data() : null);
    cacheValue = merged;
    cacheAt = now;
    return merged;
  } catch {
    cacheValue = DEFAULT_SETTINGS;
    cacheAt = now;
    return DEFAULT_SETTINGS;
  }
}

export async function seedDefaultGlobalSettings() {
  const now = new Date();
  await db()
    .doc("settings/global")
    .set(
      {
        ...DEFAULT_SETTINGS,
        updatedAt: now,
        createdAt: now
      },
      { merge: true }
    );
  return DEFAULT_SETTINGS;
}

export function getDefaultGlobalSettings() {
  return DEFAULT_SETTINGS;
}
