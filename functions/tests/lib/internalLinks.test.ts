import { describe, expect, test } from "vitest";
import { pickInternalLinks } from "../../src/lib/internalLinks";

describe("internalLinks", () => {
  test("prioritizes same cluster > keyword overlap > recency", () => {
    const picked = pickInternalLinks({
      self: {
        articleId: "self",
        clusterId: "c1",
        hashtags12: ["#Apple", "#Banana", "#Carrot"]
      },
      candidates: [
        // Same cluster, no overlap
        {
          id: "a1",
          titleFinal: "Same cluster old",
          clusterId: "c1",
          hashtags12: ["#zzz"],
          createdAt: "2026-02-01T00:00:00.000Z"
        },
        // Different cluster, high overlap, very recent
        {
          id: "b1",
          titleFinal: "Overlap recent",
          clusterId: "c2",
          hashtags12: ["#banana", "#carrot", "#x"],
          createdAt: "2026-02-10T00:00:00.000Z"
        },
        // Same cluster, overlap, less recent
        {
          id: "a2",
          titleFinal: "Same cluster overlap",
          clusterId: "c1",
          hashtags12: ["#banana"],
          createdAt: "2026-02-05T00:00:00.000Z"
        },
        // Different cluster, no overlap, most recent
        {
          id: "c1",
          titleFinal: "Recent fallback",
          clusterId: "c3",
          hashtags12: ["#none"],
          createdAt: "2026-02-12T00:00:00.000Z"
        }
      ],
      limit: 4
    });

    expect(picked.map((x) => x.articleId)).toEqual(["a2", "a1", "b1", "c1"]);
    expect(picked[0]?.reason).toMatch(/^cluster/);
  });
});

