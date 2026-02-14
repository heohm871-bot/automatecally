// runDate standard: KST (UTC+9) day key in YYYY-MM-DD.
// KST has no DST, so fixed-offset conversion is safe.

export function kstDayKey(now: Date = new Date()): string {
  const ms = now.getTime();
  if (!Number.isFinite(ms)) return new Date().toISOString().slice(0, 10);
  const kstMs = ms + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

