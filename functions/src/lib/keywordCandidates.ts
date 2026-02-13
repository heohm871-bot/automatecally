import { createHash } from "node:crypto";

export type KeywordCandidate = {
  text: string;
  textNorm: string;
  clusterId: string;
  // Heuristic metrics used until a real provider is integrated.
  trend3: number;
  trend7: number;
  trend30: number;
  blogDocs: number;
  metricsSource: "heuristic_v1";
  source: "rules_v1";
};

export function normalizeKeyword(s: string) {
  return String(s ?? "")
    .replace(/[#]+/g, " ")
    .replace(/[^\p{Letter}\p{Number}가-힣 ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashToInt(seed: string) {
  const h = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return Number.parseInt(h, 16);
}

function clampInt(n: number, min: number, max: number) {
  const x = Math.floor(n);
  return Math.max(min, Math.min(max, x));
}

function makeClusterId(siteId: string, textNorm: string) {
  // Extremely simple clustering: stable hash of normalized text.
  const digest = createHash("sha256").update(`${siteId}:${textNorm}`).digest("hex").slice(0, 10);
  return `c_${digest}`;
}

function genMetrics(seed: string) {
  const x = hashToInt(seed);
  const trend30 = 20 + (x % 120); // 20..139
  const trend7 = 15 + (Math.floor(x / 7) % 90); // 15..104
  const trend3 = 8 + (Math.floor(x / 13) % 60); // 8..67
  const blogDocs = 8_000 + (Math.floor(x / 17) % 320_000); // 8k..328k
  return {
    trend3,
    trend7,
    trend30,
    blogDocs
  };
}

function uniqPreserve<T>(arr: T[], key: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function buildKeywordCandidates(args: {
  siteId: string;
  topic?: string;
  seedKeywords?: string[];
  runDate: string;
  scheduleSlot: number;
  max?: number;
}): KeywordCandidate[] {
  const topic = normalizeKeyword(args.topic ?? "");
  const seedsRaw = [...(args.seedKeywords ?? [])].map(normalizeKeyword).filter(Boolean);

  // If topic is not set yet, fall back to seed keywords only.
  const baseSeeds = topic ? [topic, ...seedsRaw] : seedsRaw;

  const year = String(args.runDate ?? "").slice(0, 4) || String(new Date().getUTCFullYear());
  const patterns = [
    (k: string) => `${k} 방법`,
    (k: string) => `${k} 하는법`,
    (k: string) => `${k} 추천`,
    (k: string) => `${k} 정리`,
    (k: string) => `${k} 비교`,
    (k: string) => `${k} 장단점`,
    (k: string) => `${k} 주의`,
    (k: string) => `${k} 리스크`,
    (k: string) => `${k} 가격`,
    (k: string) => `${k} 후기`,
    (k: string) => `${k} 가성비`,
    (k: string) => `${year} ${k}`
  ];

  // Slot-based rotation: different slots produce different mixes.
  const slot = clampInt(args.scheduleSlot, 1, 6);
  const patternStart = (slot - 1) * 2;

  const raw: string[] = [];
  for (const seed of baseSeeds) {
    raw.push(seed);
    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[(patternStart + i) % patterns.length];
      raw.push(p(seed));
    }
    // Topic expansions
    if (topic && seed === topic) {
      raw.push(`${seed} 꿀팁`);
      raw.push(`${seed} 체크리스트`);
      raw.push(`${seed} 초보`);
      raw.push(`${seed} 혼자`);
    }
  }

  const normalized = raw.map(normalizeKeyword).filter((x) => x.length >= 2);
  const limited = uniqPreserve(normalized, (x) => x).slice(0, Math.max(10, Math.min(500, args.max ?? 250)));

  return limited.map((textNorm) => {
    const metrics = genMetrics(`${args.siteId}:${args.runDate}:${textNorm}`);
    return {
      text: textNorm,
      textNorm,
      clusterId: makeClusterId(args.siteId, textNorm),
      ...metrics,
      metricsSource: "heuristic_v1",
      source: "rules_v1"
    };
  });
}

