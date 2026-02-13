import { db } from "../../lib/admin";
import { getGlobalSettings } from "../../lib/globalSettings";
import { runQaRules, type QaIssue, type QaResult } from "../../lib/qaRules";
import { enqueueTask } from "../../lib/tasks";
import type { ArticleQaPayload } from "../schema";

type ArticleDoc = {
  html?: string;
  hashtags12?: string[];
  qaFixCount?: number;
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
    "missing_hr_per_section",
    "contains_emoji",
    "contains_markdown_bold"
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

function getRunTag(payload: ArticleQaPayload) {
  const raw = (payload as unknown as { runTag?: unknown })?.runTag;
  if (typeof raw !== "string") return "";
  const s = raw.trim().slice(0, 24);
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : "";
}

export async function articleQa(payload: ArticleQaPayload) {
  const { siteId, articleId } = payload;
  const settings = await getGlobalSettings();
  const runTag = getRunTag(payload);

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

  await aRef.set({ qa, status: qa.pass ? "ready" : "qa_failed" }, { merge: true });

  const allowImages = qa.pass || !settings.caps.generateImagesOnlyOnQaPass;
  if (!qa.pass) {
    const fixCount = typeof a.qaFixCount === "number" ? a.qaFixCount : 0;
    if (fixCount < settings.caps.qaFixMax) {
      const fixAttempt = fixCount + 1;
      await enqueueTask({
        queue: "light",
        ignoreAlreadyExists: true,
        payload: {
          ...payload,
          taskType: "article_qa_fix",
          qaFixAttempt: fixAttempt,
          idempotencyKey: `article_qa_fix:${siteId}:${payload.runDate}:${articleId}:attempt-${fixAttempt}${
            runTag ? `:${runTag}` : ""
          }`,
          articleId
        }
      });
    }
    if (!allowImages) return;
  }

  if (qa.pass) {
    await enqueueTask({
      queue: "light",
      ignoreAlreadyExists: true,
      payload: {
        ...payload,
        taskType: "topcard_render",
        idempotencyKey: `topcard_render:${siteId}:${payload.runDate}:${articleId}${runTag ? `:${runTag}` : ""}`,
        articleId
      }
    });
  }

  if (allowImages) {
    await enqueueTask({
      queue: "heavy",
      ignoreAlreadyExists: true,
      payload: {
        ...payload,
        taskType: "image_generate",
        idempotencyKey: `image_generate:${siteId}:${payload.runDate}:${articleId}${runTag ? `:${runTag}` : ""}`,
        articleId
      }
    });
  }

  if (qa.pass) {
    await enqueueTask({
      queue: "light",
      ignoreAlreadyExists: true,
      payload: {
        ...payload,
        taskType: "article_package",
        idempotencyKey: `article_package:${siteId}:${payload.runDate}:${articleId}${runTag ? `:${runTag}` : ""}`,
        articleId
      }
    });
  }
}
