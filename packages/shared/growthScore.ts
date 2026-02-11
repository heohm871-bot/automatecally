import { GROWTH_V1, compRatio, type GrowthConfig } from "./scoringConfig";

export type GrowthInput = {
  trend3: number;
  trend7: number;
  trend30: number;
  blogDocs: number;
};

export type GrowthLane = "hot" | "evergreen" | "watch";
export type CompetitionBand = "low" | "mid" | "hard" | "extreme";

export type GrowthScoreResult = {
  eligible: boolean;
  lane: GrowthLane;
  competition: CompetitionBand;
  compRatio: number;
  score: number;
  notes: string[];
};

function competitionBand(
  blogDocs: number,
  ratio: number,
  cfg: GrowthConfig
): CompetitionBand {
  if (blogDocs <= cfg.lowBlogDocsMax && ratio <= cfg.lowCompRatioMax) {
    return "low";
  }
  if (blogDocs <= cfg.midBlogDocsMax && ratio <= cfg.midCompRatioMax) {
    return "mid";
  }
  if (blogDocs <= cfg.hardBlogDocsMax && ratio <= cfg.hardCompRatioMax) {
    return "hard";
  }
  return "extreme";
}

function laneForInput(input: GrowthInput, cfg: GrowthConfig): GrowthLane {
  const momentum = input.trend3 / Math.max(input.trend30, 1);
  const stability = input.trend7 / Math.max(input.trend30, 1);
  if (momentum >= cfg.hotMomentumMin) {
    return "hot";
  }
  if (stability >= cfg.evergreenStabilityMin) {
    return "evergreen";
  }
  return "watch";
}

export function evaluateGrowthScore(
  input: GrowthInput,
  cfg: GrowthConfig = GROWTH_V1
): GrowthScoreResult {
  const ratio = compRatio(input.blogDocs, input.trend30);
  const competition = competitionBand(input.blogDocs, ratio, cfg);
  const lane = laneForInput(input, cfg);
  const eligible =
    input.trend30 >= cfg.minTrend30 && input.trend7 >= cfg.minTrend7;

  const demandScore = Math.min(35, (input.trend30 / 140) * 35);
  const recencyScore = Math.min(20, (input.trend7 / Math.max(input.trend30, 1)) * 24);
  const momentumScore = Math.min(15, (input.trend3 / Math.max(input.trend30, 1.0)) * 16);
  const laneScore = lane === "hot" ? 12 : lane === "evergreen" ? 9 : 4;
  const competitionScore =
    competition === "low" ? 18 : competition === "mid" ? 12 : competition === "hard" ? 6 : 1;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(demandScore + recencyScore + momentumScore + laneScore + competitionScore)
    )
  );

  const notes: string[] = [];
  if (!eligible) {
    notes.push("기본 수요 임계값(7d/30d)을 충족하지 못해 우선순위를 낮춰야 합니다.");
  }
  if (competition === "extreme") {
    notes.push("문서량 대비 검색수요가 낮아 경쟁 과열 구간입니다.");
  }
  if (lane === "hot") {
    notes.push("단기 모멘텀이 강합니다. 짧은 발행 주기 테스트가 유효합니다.");
  }
  if (lane === "evergreen") {
    notes.push("안정형 수요입니다. 구조화 콘텐츠와 누적 SEO에 유리합니다.");
  }
  if (lane === "watch") {
    notes.push("모멘텀/안정성이 애매합니다. 키워드 확장 후 재평가를 권장합니다.");
  }

  return {
    eligible,
    lane,
    competition,
    compRatio: ratio,
    score,
    notes,
  };
}
