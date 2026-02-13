import { describe, it, expect } from "vitest";

import { buildKeywordCandidates, normalizeKeyword } from "../../src/lib/keywordCandidates";

describe("keywordCandidates", () => {
  it("normalizeKeyword standardizes whitespace/symbols", () => {
    expect(normalizeKeyword("  #다이소!!  정리  ")).toBe("다이소 정리");
  });

  it("buildKeywordCandidates returns stable candidates with metrics", () => {
    const out = buildKeywordCandidates({
      siteId: "site1",
      topic: "생활 꿀팁",
      seedKeywords: ["다이소", "코스트코"],
      runDate: "2026-02-13",
      scheduleSlot: 1,
      max: 50
    });
    expect(out.length).toBeGreaterThan(10);
    expect(out[0]?.textNorm).toBeTruthy();
    expect(out[0]?.trend30).toBeGreaterThan(0);
    expect(out[0]?.blogDocs).toBeGreaterThan(0);
  });
});

