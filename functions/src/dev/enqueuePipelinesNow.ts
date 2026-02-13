import { randomUUID } from "node:crypto";

import { db } from "../lib/admin";
import { routeTask } from "../handlers/taskRouter";

type SiteRow = {
  isEnabled?: boolean;
  dailyTarget?: number;
};

function pickRunDate(argv: string[]) {
  const idx = argv.indexOf("--runDate");
  const v = idx >= 0 ? argv[idx + 1] : null;
  const s = typeof v === "string" ? v.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().slice(0, 10);
}

function pickTag(argv: string[]) {
  const idx = argv.indexOf("--tag");
  const v = idx >= 0 ? argv[idx + 1] : null;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "manual";
  return s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "manual";
}

async function run() {
  const argv = process.argv.slice(2);
  const runDate = pickRunDate(argv);
  const tag = pickTag(argv);
  const sitesSnap = await db().collection("sites").get();

  let enqueued = 0;
  for (const doc of sitesSnap.docs) {
    const siteId = doc.id;
    const site = (doc.data() ?? {}) as SiteRow;
    if (site.isEnabled === false) continue;

    const dailyTarget = typeof site.dailyTarget === "number" ? Math.floor(site.dailyTarget) : 3;
    const slotCount = Math.max(1, Math.min(6, Number.isFinite(dailyTarget) ? dailyTarget : 3));

    for (let slot = 1; slot <= slotCount; slot++) {
      const traceId = randomUUID();
      await routeTask({
        schemaVersion: "1.0",
        taskType: "kw_collect",
        siteId,
        traceId,
        scheduleSlot: slot,
        idempotencyKey: `kw_collect:${siteId}:${runDate}:slot${slot}:${tag}`,
        runTag: tag,
        requestedByUid: "DEV",
        createdAt: new Date().toISOString(),
        retryCount: 0,
        runDate
      } as never);
      enqueued += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runDate,
        tag,
        sites: sitesSnap.size,
        tasks: enqueued
      },
      null,
      2
    )
  );
}

run().catch((err: unknown) => {
  console.error(String((err as { message?: string })?.message ?? err));
  process.exit(1);
});
