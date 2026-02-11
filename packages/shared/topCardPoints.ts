import type { Intent } from "./intent";

export type K12 = {
  main: [string, string];
  longtail: string[];
  inflow: string[];
};

function shortLabel(k: string, maxLen = 8) {
  const s = k.replace(/\s+/g, "").replace(/[(){}\[\]<>]/g, "");
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

function pickIntentKey(k12: K12, intent: Intent): string {
  const pool = [...k12.longtail, ...k12.inflow];

  const rules: Record<Intent, RegExp> = {
    howto: /(방법|하는법|설정|초기화|오류|해결|가이드|루틴|정리)/,
    compare: /(비교|차이|장단점|추천|vs|순위|TOP)/i,
    price: /(가격|비용|가성비|할인|쿠폰|최저가)/,
    review: /(후기|리뷰|사용기|체험|솔직)/,
    risk: /(주의|부작용|리스크|손실|위험|경고|사기)/,
    info: /$^/
  };

  const re = rules[intent];
  const match = pool.find((k) => re.test(k));
  return match ?? k12.inflow[0] ?? k12.longtail[0] ?? k12.main[0];
}

export function buildTopCardPoints(k12: K12, intent: Intent) {
  const p1 = k12.main[0];
  const p2 = k12.main[1];
  const p3 = pickIntentKey(k12, intent);

  const points = [p1, p2, p3] as const;
  const labelsShort = points.map((p) => shortLabel(p, 8));

  const iconKeys = ["target", "tag", "spark"] as const;

  return { points, labelsShort, iconKeys };
}
