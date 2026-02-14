import { db } from "../../lib/admin";
import { getGlobalSettings } from "../../lib/globalSettings";
import { fixHtmlWithQaIssues } from "../../lib/qaFixer";
import { runQaRules } from "../../lib/qaRules";
import { enqueueTask } from "../../lib/tasks";
import type { ArticleQaFixPayload } from "../schema";
import { canUseLlm, getLlmUsage, bumpLlmUsage } from "../../lib/llmUsage";
import { callOpenAiStructuredCached, MODEL_DEFAULT } from "../../lib/llm/openai";
import { QaFixJsonSchema, QaFixOutZ, SCHEMA_VERSION } from "../../lib/llm/schemas";
import { recordArticleLlmCost } from "../../lib/costAccounting";

type ArticleDoc = {
  html?: string;
  hashtags12?: string[];
  keywordId?: string;
  llmUsage?: Record<string, unknown>;
  qaFixCount?: number;
};

type KeywordDoc = { text?: string };
type SiteDoc = { defaults?: { banWords?: string[] } };

function makeHashtags12(keyword: string) {
  const base = keyword.replace(/[#\s]+/g, "").trim() || "키워드";
  const seeds = [
    base,
    `${base}방법`,
    `${base}정리`,
    `${base}비교`,
    `${base}주의`,
    `${base}팁`,
    `${base}추천`,
    `${base}후기`,
    `${base}가이드`,
    `${base}체크`,
    `${base}핵심`,
    `${base}FAQ`
  ];
  return seeds.map((x) => `#${x}`.replace(/\s+/g, ""));
}

export async function articleQaFix(payload: ArticleQaFixPayload) {
  const { siteId, articleId } = payload;
  const settings = await getGlobalSettings();
  const runTagRaw = (payload as unknown as { runTag?: unknown })?.runTag;
  const runTag = typeof runTagRaw === "string" && runTagRaw.trim() ? runTagRaw.trim().slice(0, 24) : "";

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
    // Ensure the pipeline continues to packaging even if QA now passes here.
    // In inline/async execution, article_qa_fix may observe a passing doc while the original
    // article_qa had failed; re-run article_qa to follow the canonical flow (topcard/images/package).
    await enqueueTask({
      queue: "light",
      ignoreAlreadyExists: true,
      payload: {
        ...payload,
        taskType: "article_qa",
        idempotencyKey: `article_qa:${siteId}:${payload.runDate}:${articleId}:after-fix-pass${
          runTag ? `:${runTag}` : ""
        }`,
        articleId
      }
    });
    return;
  }

  const currentFixCount = typeof a.qaFixCount === "number" ? a.qaFixCount : 0;
  if (currentFixCount >= settings.caps.qaFixMax) {
    await aRef.set({ qa: currentQa, status: "qa_failed" }, { merge: true });
    return;
  }

  const llmUsage = getLlmUsage(a.llmUsage);
  const canUse = canUseLlm("qaFix", llmUsage, settings.caps);
  const openAiEnabled = Boolean(process.env.OPENAI_API_KEY);
  const capExceeded = openAiEnabled && !canUse;
  const useLlm = openAiEnabled && canUse;

  let nextHtml = a.html ?? "";
  let nextHashtags12 = a.hashtags12 ?? [];
  if (useLlm) {
    const normalizedRequest = {
      keyword: keywordText,
      issues: currentQa.issues,
      html: a.html ?? "",
      bannedWords: site?.defaults?.banWords ?? []
    };
    const promptVersion = "2026-02-12";
    const system = [
      "너는 HTML QA 수정기다.",
      "응답은 반드시 JSON 스키마를 따르고 html만 반환한다.",
      "기존 문맥을 유지하면서 QA 이슈를 최소 수정으로 해결한다."
    ].join(" ");
    const user = [
      `키워드: ${keywordText}`,
      `이슈: ${currentQa.issues.join(", ") || "none"}`,
      `금칙어: ${(site?.defaults?.banWords ?? []).join(", ") || "없음"}`,
      "원본 HTML:",
      a.html ?? ""
    ].join("\n");

    try {
      const { out, cacheHash, usage } = await callOpenAiStructuredCached({
        task: "qaFix",
        normalizedRequest,
        schemaVersion: SCHEMA_VERSION,
        promptVersion,
        model: MODEL_DEFAULT,
        schemaName: "blog_qa_fix_v1",
        jsonSchema: QaFixJsonSchema,
        system,
        user,
        zod: QaFixOutZ,
        ttlDays: 30
      });
      await recordArticleLlmCost({
        siteId,
        runDate: payload.runDate,
        articleId,
        cacheHash,
        model: MODEL_DEFAULT,
        usage
      });
      nextHtml = out.html;
    } catch {
      // fallback: keep rule-based fix only
    }
  }
  if (currentQa.issues.includes("missing_hashtags_12")) {
    nextHashtags12 = makeHashtags12(keywordText);
  }
  nextHtml = fixHtmlWithQaIssues({
    html: nextHtml,
    issues: currentQa.issues,
    keyword: keywordText,
    bannedWords: site?.defaults?.banWords ?? []
  });

  const nextFixCount = currentFixCount + 1;
  const nextUsage = useLlm ? bumpLlmUsage(llmUsage, "qaFix") : llmUsage;
  await aRef.set(
    {
      html: nextHtml,
      hashtags12: nextHashtags12,
      qaFixCount: nextFixCount,
      llmUsage: nextUsage,
      status: "generating",
      updatedAt: new Date()
    },
    { merge: true }
  );

  await enqueueTask({
    queue: "light",
    ignoreAlreadyExists: true,
    payload: {
      ...payload,
      taskType: "article_qa",
      idempotencyKey: `article_qa:${siteId}:${payload.runDate}:${articleId}:after-fix-${nextFixCount}${
        runTag ? `:${runTag}` : ""
      }`,
      articleId
    }
  });

  if (capExceeded) {
    return {
      finalState: "skipped",
      lastErrorCode: "CAP_EXCEEDED",
      lastErrorMessage: "caps.qaFixMax exceeded; LLM call skipped"
    };
  }
}
