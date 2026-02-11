export type GrowthConfig = {
  minTrend30: number;
  minTrend7: number;

  hotMomentumMin: number; // trend3/trend30
  evergreenStabilityMin: number; // trend7/trend30

  lowBlogDocsMax: number;
  lowCompRatioMax: number;

  midBlogDocsMax: number;
  midCompRatioMax: number;

  hardBlogDocsMax: number;
  hardCompRatioMax: number;

  midCompetitionShare: number; // 0.10~0.20
};

export const GROWTH_V1: GrowthConfig = {
  minTrend30: 20,
  minTrend7: 15,

  hotMomentumMin: 1.10,
  evergreenStabilityMin: 0.90,

  lowBlogDocsMax: 50_000,
  lowCompRatioMax: 40,

  midBlogDocsMax: 150_000,
  midCompRatioMax: 90,

  hardBlogDocsMax: 300_000,
  hardCompRatioMax: 140,

  midCompetitionShare: 0.15
};

export function compRatio(blogDocs: number, trend30: number) {
  const monthly = Math.max(trend30 * 30, 1);
  return blogDocs / monthly;
}
