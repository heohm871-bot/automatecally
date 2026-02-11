import { db } from "../lib/admin";

type SeedSite = {
  siteId: string;
  name: string;
  platform: "naver" | "tistory";
  topic: string;
  growthOverride: number;
  isEnabled: boolean;
  dailyTarget: number;
  publishWindows: string[];
  publishMode: "scheduled" | "manual";
  publishMinIntervalMin: number;
};

const DEFAULT_SITES: SeedSite[] = [
  {
    siteId: "site-naver-life",
    name: "Naver Life Lab",
    platform: "naver",
    topic: "생활 꿀팁",
    growthOverride: 0,
    isEnabled: true,
    dailyTarget: 3,
    publishWindows: ["09:30", "13:30", "20:30"],
    publishMode: "scheduled",
    publishMinIntervalMin: 60
  },
  {
    siteId: "site-tistory-tech",
    name: "Tistory Tech Brief",
    platform: "tistory",
    topic: "테크/생산성",
    growthOverride: 0.1,
    isEnabled: true,
    dailyTarget: 3,
    publishWindows: ["08:40", "12:20", "19:50"],
    publishMode: "scheduled",
    publishMinIntervalMin: 60
  },
  {
    siteId: "site-naver-money",
    name: "Naver Money Note",
    platform: "naver",
    topic: "재테크/절약",
    growthOverride: 0.2,
    isEnabled: true,
    dailyTarget: 3,
    publishWindows: ["07:50", "12:40", "21:10"],
    publishMode: "manual",
    publishMinIntervalMin: 60
  }
];

function pickSites(): SeedSite[] {
  const raw = process.env.SITES_SEED_JSON;
  if (!raw) return DEFAULT_SITES;
  try {
    const parsed = JSON.parse(raw) as SeedSite[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SITES;
  } catch {
    return DEFAULT_SITES;
  }
}

async function run() {
  const sites = pickSites();
  const now = new Date();

  for (const site of sites) {
    await db()
      .doc(`sites/${site.siteId}`)
      .set(
        {
          siteId: site.siteId,
          name: site.name,
          platform: site.platform,
          topic: site.topic,
          growthOverride: site.growthOverride,
          isEnabled: site.isEnabled,
          dailyTarget: site.dailyTarget,
          publishWindows: site.publishWindows,
          publishMode: site.publishMode,
          publishMinIntervalMin: site.publishMinIntervalMin,
          updatedAt: now,
          createdAt: now
        },
        { merge: true }
      );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        count: sites.length,
        siteIds: sites.map((s) => s.siteId)
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
