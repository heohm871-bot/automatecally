import fs from "node:fs";
import path from "node:path";
import { db } from "../lib/admin";

function yes(v: string | undefined, defaultValue = false) {
  if (v == null) return defaultValue;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

async function dumpCollection(name: string, limit: number, siteId?: string) {
  let q: FirebaseFirestore.Query = db().collection(name).limit(limit);
  if (siteId) {
    q = q.where("siteId", "==", siteId).limit(limit);
  }
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function dumpArticleHistoryOnly(limit: number, siteId?: string) {
  let q: FirebaseFirestore.Query = db().collection("articles").limit(limit);
  if (siteId) q = q.where("siteId", "==", siteId).limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      siteId: data.siteId ?? null,
      keywordId: data.keywordId ?? null,
      pipelineLastTask: data.pipelineLastTask ?? null,
      pipelineLastStatus: data.pipelineLastStatus ?? null,
      pipelineUpdatedAt: data.pipelineUpdatedAt ?? null,
      pipelineHistory: data.pipelineHistory ?? []
    };
  });
}

function writeDump(outDir: string, name: string, rows: Array<Record<string, unknown>>, format: "json" | "ndjson" | "both") {
  if (format === "ndjson" || format === "both") {
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : "");
    fs.writeFileSync(path.join(outDir, `${name}.ndjson`), body);
  }
  if (format === "json" || format === "both") {
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows, null, 2));
  }
}

function toMillis(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toDate === "function") {
      try {
        const d = (obj.toDate as () => Date)();
        return d.getTime();
      } catch {
        return 0;
      }
    }
    if (typeof obj.seconds === "number") return obj.seconds * 1000;
    if (typeof obj._seconds === "number") return obj._seconds * 1000;
  }
  return 0;
}

function sortRows(rows: Array<Record<string, unknown>>, sortBy: "updatedAt" | "startedAt" | null) {
  if (!sortBy) return rows;
  return [...rows].sort((a, b) => toMillis(b[sortBy]) - toMillis(a[sortBy]));
}

const ALLOWED_COLLECTIONS = ["taskRuns", "e2eRuns", "articles", "articleHistory", "taskFailures"] as const;
type AllowedCollection = (typeof ALLOWED_COLLECTIONS)[number];

function parseSelectedCollections(raw: string | undefined): Set<AllowedCollection> | null {
  if (!raw) return null;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selected = new Set<AllowedCollection>();
  for (const item of items) {
    if ((ALLOWED_COLLECTIONS as readonly string[]).includes(item)) {
      selected.add(item as AllowedCollection);
    }
  }
  return selected.size > 0 ? selected : null;
}

async function run() {
  const outDir = path.resolve(process.cwd(), ".artifacts");
  fs.mkdirSync(outDir, { recursive: true });

  const limit = Number(process.env.DUMP_LIMIT ?? 200);
  const siteId = process.env.DUMP_SITE_ID;
  const dumpFormatRaw = (process.env.DUMP_FORMAT ?? "json").toLowerCase();
  const format: "json" | "ndjson" | "both" =
    dumpFormatRaw === "ndjson" ? "ndjson" : dumpFormatRaw === "both" ? "both" : "json";
  const sortByRaw = (process.env.DUMP_SORT_BY ?? "").toLowerCase();
  const sortBy: "updatedAt" | "startedAt" | null =
    sortByRaw === "updatedat" ? "updatedAt" : sortByRaw === "startedat" ? "startedAt" : null;

  const includeArticles = yes(process.env.DUMP_INCLUDE_ARTICLES, false);
  const includeArticleHistoryOnly = yes(process.env.DUMP_INCLUDE_ARTICLE_HISTORY_ONLY, false);
  const includeTaskFailures = yes(process.env.DUMP_INCLUDE_TASK_FAILURES, false);
  const selectedCollections = parseSelectedCollections(process.env.DUMP_COLLECTIONS);

  const shouldDump = (name: AllowedCollection) => {
    if (!selectedCollections) return true;
    return selectedCollections.has(name);
  };

  if (shouldDump("taskRuns")) {
    const taskRuns = await dumpCollection("taskRuns", limit, siteId);
    writeDump(outDir, "taskRuns", sortRows(taskRuns, sortBy), format);
  }
  if (shouldDump("e2eRuns")) {
    const e2eRuns = await dumpCollection("e2eRuns", limit, siteId);
    writeDump(outDir, "e2eRuns", sortRows(e2eRuns, sortBy), format);
  }

  if (includeArticles && shouldDump("articles")) {
    const articles = await dumpCollection("articles", limit, siteId);
    writeDump(outDir, "articles", sortRows(articles, sortBy), format);
  }

  if (includeArticleHistoryOnly && shouldDump("articleHistory")) {
    const articleHistory = await dumpArticleHistoryOnly(limit, siteId);
    writeDump(outDir, "articleHistory", sortRows(articleHistory, sortBy), format);
  }

  if (includeTaskFailures && shouldDump("taskFailures")) {
    const taskFailures = await dumpCollection("taskFailures", limit, siteId);
    writeDump(outDir, "taskFailures", sortRows(taskFailures, sortBy), format);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir,
        limit,
        format,
        sortBy,
        siteId: siteId ?? null,
        includeArticles,
        includeArticleHistoryOnly,
        includeTaskFailures,
        selectedCollections: selectedCollections ? Array.from(selectedCollections) : null
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
