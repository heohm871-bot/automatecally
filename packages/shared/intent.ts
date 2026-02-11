export type Intent = "howto" | "compare" | "price" | "review" | "risk" | "info";

const RULES: Array<{ intent: Intent; re: RegExp }> = [
  { intent: "howto", re: /(방법|하는법|설정|초기화|오류|해결|가이드|루틴|정리)/ },
  { intent: "compare", re: /(비교|차이|장단점|추천|vs|순위|TOP)/i },
  { intent: "price", re: /(가격|비용|가성비|할인|쿠폰|최저가)/ },
  { intent: "review", re: /(후기|리뷰|사용기|체험|솔직)/ },
  { intent: "risk", re: /(주의|부작용|리스크|손실|위험|경고|사기)/ }
];

export function detectIntent(text: string): Intent {
  for (const r of RULES) if (r.re.test(text)) return r.intent;
  return "info";
}
