import { db } from "../../lib/admin";
import { getGlobalSettings } from "../../lib/globalSettings";
import { fixHtmlWithQaIssues } from "../../lib/qaFixer";
import { runQaRules } from "../../lib/qaRules";
import { enqueueTask } from "../../lib/tasks";
import type { ArticleQaFixPayload } from "../schema";
import { canUseLlm, getLlmUsage, bumpLlmUsage } from "../../lib/llmUsage";

type ArticleDoc = {
  html?: string;
  hashtags12?: string[];
  keywordId?: string;
  llmUsage?: Record<string, unknown>;
  qaFixCount?: number;
};

type KeywordDoc = { text?: string };
type SiteDoc = { defaults?: { banWords?: string[] } };

export async function articleQaFix(payload: ArticleQaFixPayload) {
  const { siteId, articleId } = payload;
  const settings = await getGlobalSettings();

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  const siteSnap = await db().doc(`sites/${siteId}`).get();
  const site = (siteSnap.data() ?? {}) as SiteDoc;

  const kwSnap = await db().doc(`keywords/${a.keywordId}`).get();
  const kw = (kwSnap.data() ?? {}) as KeywordDoc;
  const keywordText = String(kw.text ?? "키워드");

  const currentQa = runQaRules({
    html: a.html ?? "",
    hashtags12: a.hashtags12 ?? [],
    bannedWords: site?.defaults?.banWords ?? []
  });

  if (currentQa.pass) {
    await aRef.set({ qa: currentQa, status: "ready" }, { merge: true });
    return;
  }

  const currentFixCount = typeof a.qaFixCount === "number" ? a.qaFixCount : 0;
  if (currentFixCount >= settings.caps.qaFixMax) {
    await aRef.set({ qa: currentQa, status: "qa_failed" }, { merge: true });
    return;
  }

  const llmUsage = getLlmUsage(a.llmUsage);
  const canUse = canUseLlm("qaFix", llmUsage, settings.caps);
  const useLlm = process.env.QA_FIX_LLM_MODE === "llm" && canUse;

  let nextHtml = a.html ?? "";
  if (useLlm) {
    // Placeholder: LLM integration not wired. Fallback to rule-based fix.
  }
  nextHtml = fixHtmlWithQaIssues({
    html: nextHtml,
    issues: currentQa.issues,
    keyword: keywordText,
    bannedWords: site?.defaults?.banWords ?? []
  });

  const nextUsage = useLlm ? bumpLlmUsage(llmUsage, "qaFix") : llmUsage;
  await aRef.set(
    {
      html: nextHtml,
      qaFixCount: currentFixCount + 1,
      llmUsage: nextUsage,
      status: "generating",
      updatedAt: new Date()
    },
    { merge: true }
  );

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "article_qa",
      idempotencyKey: `article_qa:${siteId}:${articleId}`,
      articleId
    }
  });
}
