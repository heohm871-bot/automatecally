import { db } from "./admin";

export type InternalLink = {
  articleId: string;
  title: string;
  packagePath?: string | null;
  createdAt?: string | null;
  reason?: string;
};

type ArticleCandidate = {
  id: string;
  titleFinal?: string;
  packagePath?: string;
  createdAt?: unknown;
  clusterId?: string;
  hashtags12?: string[];
};

function toIsoMaybe(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  // Firestore Timestamp-like
  if (typeof v === "object" && v && "toDate" in v && typeof (v as any).toDate === "function") {
    try {
      return (v as any).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (v instanceof Date) return v.toISOString();
  return null;
}

function normTag(s: string) {
  return s
    .trim()
    .replace(/^#+/, "")
    .toLowerCase();
}

export function keywordOverlapScore(aTags: string[], bTags: string[]) {
  const a = new Set(aTags.map(normTag).filter(Boolean));
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of bTags.map(normTag)) {
    if (!t) continue;
    if (a.has(t)) hit += 1;
  }
  return hit;
}

export function pickInternalLinks(args: {
  self: { articleId: string; clusterId?: string; hashtags12?: string[] };
  candidates: ArticleCandidate[];
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(6, args.limit ?? 4));
  const selfCluster = String(args.self.clusterId ?? "").trim();
  const selfTags = Array.isArray(args.self.hashtags12) ? args.self.hashtags12 : [];

  const scored = args.candidates
    .filter((c) => c && c.id && c.id !== args.self.articleId)
    .map((c) => {
      const title = String(c.titleFinal ?? "").trim();
      const cluster = String(c.clusterId ?? "").trim();
      const isSameCluster = Boolean(selfCluster && cluster && selfCluster === cluster);
      const overlap = keywordOverlapScore(selfTags, Array.isArray(c.hashtags12) ? c.hashtags12 : []);
      const createdAtIso = toIsoMaybe(c.createdAt);
      const createdAtMs = createdAtIso ? Date.parse(createdAtIso) : 0;
      return {
        c,
        title,
        isSameCluster,
        overlap,
        createdAtMs,
        createdAtIso
      };
    })
    .filter((row) => row.title.length > 0);

  scored.sort((x, y) => {
    if (x.isSameCluster !== y.isSameCluster) return x.isSameCluster ? -1 : 1;
    if (x.overlap !== y.overlap) return y.overlap - x.overlap;
    return y.createdAtMs - x.createdAtMs;
  });

  const picked: InternalLink[] = [];
  for (const row of scored) {
    if (picked.length >= limit) break;
    const reason = row.isSameCluster
      ? row.overlap > 0
        ? `cluster+overlap(${row.overlap})`
        : "cluster"
      : row.overlap > 0
        ? `overlap(${row.overlap})`
        : "recent";
    picked.push({
      articleId: row.c.id,
      title: row.title,
      packagePath: row.c.packagePath ?? null,
      createdAt: row.createdAtIso,
      reason
    });
  }
  return picked;
}

export async function computeAndStoreInternalLinks(args: {
  siteId: string;
  articleId: string;
  clusterId?: string | null;
  hashtags12?: string[] | null;
  limit?: number;
}) {
  const aRef = db().doc(`articles/${args.articleId}`);
  const existingSnap = await aRef.get();
  const existing = (existingSnap.data() ?? {}) as { internalLinks?: unknown };
  if (Array.isArray(existing.internalLinks) && existing.internalLinks.length > 0) return;

  const snap = await db()
    .collection("articles")
    .where("siteId", "==", args.siteId)
    .where("status", "in", ["packaged", "published"])
    .orderBy("createdAt", "desc")
    .limit(80)
    .get();

  const candidates: ArticleCandidate[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      titleFinal: typeof data.titleFinal === "string" ? data.titleFinal : undefined,
      packagePath: typeof data.packagePath === "string" ? data.packagePath : undefined,
      createdAt: data.createdAt,
      clusterId: typeof data.clusterId === "string" ? data.clusterId : undefined,
      hashtags12: Array.isArray(data.hashtags12) ? (data.hashtags12 as string[]) : undefined
    };
  });

  const picked = pickInternalLinks({
    self: {
      articleId: args.articleId,
      clusterId: args.clusterId ?? undefined,
      hashtags12: args.hashtags12 ?? undefined
    },
    candidates,
    limit: args.limit
  });

  await aRef.set(
    {
      internalLinks: picked,
      internalLinksPickedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

