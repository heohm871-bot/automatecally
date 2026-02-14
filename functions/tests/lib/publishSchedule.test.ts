import { describe, it, expect } from "vitest";

import { nextSpecificWindowUtcMs, nextWindowUtcMs, parseHm } from "../../src/lib/publishSchedule";

describe("publishSchedule", () => {
  it("parseHm parses HH:mm", () => {
    expect(parseHm("09:30")).toEqual({ h: 9, m: 30 });
    expect(parseHm("9:30")).toEqual({ h: 9, m: 30 });
    expect(parseHm("24:00")).toBeNull();
    expect(parseHm("09:60")).toBeNull();
    expect(parseHm("x")).toBeNull();
  });

  it("nextWindowUtcMs picks the next upcoming window in KST", () => {
    // base: 2026-02-13 10:00 KST = 2026-02-13T01:00:00Z
    const base = Date.UTC(2026, 1, 13, 1, 0, 0);
    const t = nextWindowUtcMs(base, ["09:30", "13:30", "20:30"]);
    // next: 13:30 KST = 04:30Z
    expect(new Date(t).toISOString()).toBe("2026-02-13T04:30:00.000Z");
  });

  it("nextSpecificWindowUtcMs rolls to next day if the window already passed", () => {
    // base: 2026-02-13 21:30 KST = 2026-02-13T12:30:00Z
    const base = Date.UTC(2026, 1, 13, 12, 30, 0);
    const hm = parseHm("09:30");
    expect(hm).not.toBeNull();
    const t = nextSpecificWindowUtcMs(base, hm!);
    // next day 09:30 KST = 00:30Z
    expect(new Date(t).toISOString()).toBe("2026-02-14T00:30:00.000Z");
  });
});

