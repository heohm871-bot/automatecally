const KST_OFFSET_MIN = 9 * 60;
const KST_OFFSET_MS = KST_OFFSET_MIN * 60 * 1000;

export function parseHm(s: string): { h: number; m: number } | null {
  const raw = String(s ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function kstDatePartsFromUtcMs(utcMs: number) {
  const kst = new Date(utcMs + KST_OFFSET_MS);
  return {
    y: kst.getUTCFullYear(),
    mo: kst.getUTCMonth(), // 0-based
    d: kst.getUTCDate()
  };
}

function windowUtcMsForKstDay(args: { y: number; mo: number; d: number; hm: { h: number; m: number } }) {
  // Convert a KST wall-clock time into a UTC timestamp by subtracting +09:00.
  return Date.UTC(args.y, args.mo, args.d, args.hm.h - 9, args.hm.m, 0, 0);
}

export function nextSpecificWindowUtcMs(baseUtcMs: number, hm: { h: number; m: number }) {
  const day = kstDatePartsFromUtcMs(baseUtcMs);
  const today = windowUtcMsForKstDay({ ...day, hm });
  if (today >= baseUtcMs) return today;
  const tomorrow = windowUtcMsForKstDay({ y: day.y, mo: day.mo, d: day.d + 1, hm });
  return tomorrow;
}

export function nextWindowUtcMs(baseUtcMs: number, windows: string[]) {
  const hms = windows.map(parseHm).filter(Boolean) as Array<{ h: number; m: number }>;
  if (hms.length === 0) return baseUtcMs;

  let best: number | null = null;
  for (const hm of hms) {
    const t = nextSpecificWindowUtcMs(baseUtcMs, hm);
    if (best == null || t < best) best = t;
  }
  return best ?? baseUtcMs;
}

