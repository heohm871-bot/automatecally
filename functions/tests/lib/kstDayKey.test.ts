import { describe, expect, test } from "vitest";
import { kstDayKey } from "../../../packages/shared/kstDayKey";

describe("kstDayKey", () => {
  test("returns KST dayKey (UTC+9) across boundary", () => {
    // 15:30Z is 00:30 KST next day
    expect(kstDayKey(new Date("2026-02-14T15:30:00.000Z"))).toBe("2026-02-15");
    // 00:30Z is 09:30 KST same day
    expect(kstDayKey(new Date("2026-02-14T00:30:00.000Z"))).toBe("2026-02-14");
  });
});

