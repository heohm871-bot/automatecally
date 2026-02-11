import { db } from "../../lib/admin";
import { runQaRules, type QaIssue, type QaResult } from "../../lib/qaRules";
import { enqueueTask } from "../../lib/tasks";
import type { ArticleQaPayload } from "../schema";

type ArticleDoc = {
  html?: string;
  hashtags12?: string[];
};

type SiteDoc = {
  defaults?: { banWords?: string[] };
};

function parseForcedIssues(raw: string | undefined): QaIssue[] {
  if (!raw) return ["too_short"];
  const allowed: QaIssue[] = [
    "missing_toc",
    "missing_h2_4",
    "missing_hashtags_12",
    "missing_table_or_faq",
    "too_short",
    "banned_words",
    "missing_hr_per_section"
  ];
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as QaIssue[];
  const valid = items.filter((i) => allowed.includes(i));
  return valid.length > 0 ? valid : ["too_short"];
}

function applyQaOverride(base: QaResult): QaResult {
  const forced = (process.env.QA_FORCE_RESULT ?? "").toLowerCase();
  if (forced === "pass") {
    return { pass: true, issues: [] };
  }
  if (forced === "fail") {
    return { pass: false, issues: parseForcedIssues(process.env.QA_FORCE_ISSUES) };
  }
  return base;
}

export async function articleQa(payload: ArticleQaPayload) {
  const { siteId, articleId } = payload;

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  const siteSnap = await db().doc(`sites/${siteId}`).get();
  const site = (siteSnap.data() ?? {}) as SiteDoc;

  const qaBase = runQaRules({
    html: a.html ?? "",
    hashtags12: a.hashtags12 ?? [],
    bannedWords: site?.defaults?.banWords ?? []
  });
  const qa = applyQaOverride(qaBase);

  await aRef.set({ qa, status: qa.pass ? "ready" : "draft" }, { merge: true });

  if (!qa.pass) return;

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "topcard_render",
      idempotencyKey: `topcard_render:${siteId}:${articleId}`,
      articleId
    }
  });

  await enqueueTask({
    queue: "heavy",
    payload: {
      ...payload,
      taskType: "image_generate",
      idempotencyKey: `image_generate:${siteId}:${articleId}`,
      articleId
    }
  });

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "article_package",
      idempotencyKey: `article_package:${siteId}:${articleId}`,
      articleId
    }
  });
}
