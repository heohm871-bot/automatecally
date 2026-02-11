export function normalizeTitle(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^0-9a-z가-힣 ]/g, "")
    .trim();
}

function ngrams(s: string, n: number) {
  const out = new Set<string>();
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function maxTitleSimilarity(newTitle: string, oldTitles: string[]) {
  const t = normalizeTitle(newTitle);
  const a2 = ngrams(t, 2);
  const a3 = ngrams(t, 3);

  let maxSim = 0;
  for (const old of oldTitles) {
    const o = normalizeTitle(old);
    const b2 = ngrams(o, 2);
    const b3 = ngrams(o, 3);
    const sim = Math.max(jaccard(a2, b2), jaccard(a3, b3));
    if (sim > maxSim) maxSim = sim;
  }
  return maxSim;
}
