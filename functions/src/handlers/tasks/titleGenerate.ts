import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { TitleGeneratePayload } from "../schema";
import { detectIntent } from "../../../../packages/shared/intent";
import { maxTitleSimilarity } from "../../../../packages/shared/titleSimilarity";
import { getGlobalSettings } from "../../lib/globalSettings";
import { canUseLlm, getLlmUsage, bumpLlmUsage } from "../../lib/llmUsage";
import { callOpenAiStructuredCached, MODEL_DEFAULT } from "../../lib/llm/openai";
import { SCHEMA_VERSION, TitleJsonSchema, TitleOutZ } from "../../lib/llm/schemas";
import { createHash } from "node:crypto";
import { recordArticleLlmCost } from "../../lib/costAccounting";
import { budgetCheckAndMaybeAlert } from "../../lib/budgets";

type KeywordDoc = { text?: string };
type ArticleDoc = { titleFinal?: string };

function makeArticleId(siteId: string, keywordId: string, runDate: string, runTag: string) {
  const suffix = runTag && runTag !== "default" ? `:${runTag}` : "";
  const digest = createHash("sha256").update(`${siteId}:${keywordId}:${runDate}${suffix}`).digest("hex").slice(0, 24);
  return `a_${digest}`;
}

const A = (shock: string, situation: string, kw: string) => `"${shock}" ${situation} ${kw}`;
const B = (lack: string, num: number, kw: string) => `${lack} ${num}가지 ${kw}`;
const C = (place: string, target: string, kw: string) => `${place}에서 ${target} ${kw}`;

function stripEmoji(s: string) {
  try {
    // Node 22 supports Unicode property escapes, but keep it defensive.
    return s.replace(/\p{Extended_Pictographic}/gu, "");
  } catch {
    return s;
  }
}

function finalizeTitle(raw: string, keyword: string) {
  const kw = String(keyword ?? "").replace(/\s+/g, " ").trim();
  let t = String(raw ?? "")
    .replace(/\*\*/g, "") // avoid markdown bold markers
    .replace(/\s+/g, " ")
    .trim();
  t = stripEmoji(t).replace(/\s+/g, " ").trim();

  if (kw && !t.endsWith(kw)) t = `${t} ${kw}`.replace(/\s+/g, " ").trim();
  // Hard cut (recommended). Keep the end so the keyword stays at the tail.
  if (t.length > 60) t = t.slice(t.length - 60).trim();
  return t;
}

function buildCandidates(keyword: string) {
  const shocks = ["충격", "반전", "실화", "의외"];
  const situations = [
    "지금 다들 틀리는 이유",
    "초보가 가장 많이 망하는 지점",
    "알고 나면 너무 허무한 포인트",
    "오늘부터 달라지는 포인트"
  ];
  const lacks = ["모르면 손해", "괜히 했다가 후회", "대부분 놓치는", "처음엔 다 실수하는"];
  const places = ["코스트코", "다이소", "집", "회사"];
  const targets = ["초보", "바쁜 사람", "처음 하는 사람", "혼자 하는 사람"];

  const out: string[] = [];
  out.push(A(shocks[0], situations[0], keyword));
  out.push(A(shocks[1], situations[1], keyword));
  out.push(B(lacks[0], 3, keyword));
  out.push(B(lacks[1], 5, keyword));
  out.push(C(places[0], targets[0], keyword));
  out.push(C(places[1], targets[1], keyword));
  out.push(`딱 1개만 고르면 됩니다 ${keyword}`);
  out.push(`초보가 바로 써먹는 순서 ${keyword}`);
  out.push(`이 2가지만은 피하세요 ${keyword}`);
  out.push(`생각보다 갈리는 포인트 ${keyword}`);
  out.push(`지금 필요한 건 이것뿐 ${keyword}`);
  out.push(`돈 아끼는 선택지 3개 ${keyword}`);

  const normalized = out.map((t) => t.replace(/\s+/g, " ").trim());
  const uniq = Array.from(new Set(normalized.map((t) => finalizeTitle(t, keyword))));
  return uniq;
}

export async function titleGenerate(payload: TitleGeneratePayload) {
  const { siteId, keywordId } = payload;
  const settings = await getGlobalSettings();

  const kwSnap = await db().doc(`keywords/${keywordId}`).get();
  if (!kwSnap.exists) throw new Error("keyword not found");
  const kw = (kwSnap.data() ?? {}) as KeywordDoc;
  const keyword = String(kw.text ?? "").trim();
  const intent = detectIntent(keyword);
  const runTagRaw = (payload as unknown as { runTag?: unknown })?.runTag;
  const runTag = typeof runTagRaw === "string" && runTagRaw.trim() ? runTagRaw.trim().slice(0, 24) : "default";

  const articlesRef = db().collection("articles");
  const oldTitles: string[] = [];
  try {
    const recent = await articlesRef.where("siteId", "==", siteId).orderBy("createdAt", "desc").limit(60).get();
    oldTitles.push(
      ...recent.docs
        .map((d) => String(((d.data() ?? {}) as ArticleDoc).titleFinal ?? ""))
        .filter(Boolean)
    );
  } catch {
    // Fallback when composite index is not ready in a fresh emulator/project.
  }

  const candidates = buildCandidates(keyword);
  const articleId = makeArticleId(siteId, keywordId, payload.runDate, runTag);
  const aRef = db().doc(`articles/${articleId}`);
  const existingSnap = await aRef.get();
  const existing = (existingSnap.data() ?? {}) as { llmUsage?: unknown };
  const existingLifecycle = existingSnap.exists ? (existingSnap.get("lifecycle") as unknown) : undefined;
  const existingStatus = existingSnap.exists ? (existingSnap.get("status") as unknown) : undefined;
  const llmUsage = getLlmUsage(existing.llmUsage);
  const openAiEnabled = Boolean(process.env.OPENAI_API_KEY);
  const allowedByCaps = canUseLlm("title", llmUsage, settings.caps);
  const capExceeded = openAiEnabled && !allowedByCaps;
  const budget = openAiEnabled
    ? await budgetCheckAndMaybeAlert({
        siteId,
        runDate: payload.runDate,
        budgets: settings.budgets,
        taskType: "title_generate"
      })
    : { enabled: false as const, stop: false, total: { cost: 0, limit: 0, ratio: 0 }, site: { cost: 0, limit: 0, ratio: 0 } };
  const budgetExceeded = openAiEnabled && budget.enabled && budget.stop;
  const useLlm = openAiEnabled && allowedByCaps && !budgetExceeded;
  const nextLlmUsage = useLlm ? bumpLlmUsage(llmUsage, "title") : llmUsage;

  let picked = candidates[0] ?? finalizeTitle(keyword, keyword);
  let pickedSim = 1;
  let pickedLenScore = 999;

  for (const t0 of candidates) {
    const t = finalizeTitle(t0, keyword);
    const sim = maxTitleSimilarity(t, oldTitles);
    const len = t.length;
    const lenScore = len >= 28 && len <= 38 ? 0 : len <= 60 ? 1 : 2;
    if (sim < 0.3) {
      picked = t;
      pickedSim = sim;
      pickedLenScore = lenScore;
      break;
    }
    if (sim < pickedSim || (sim === pickedSim && lenScore < pickedLenScore)) {
      picked = t;
      pickedSim = sim;
      pickedLenScore = lenScore;
    }
  }

  if (useLlm) {
    const normalizedRequest = {
      keyword,
      intent,
      oldTitles: oldTitles.slice(0, 30)
    };
    const promptVersion = "2026-02-12";
    const system = [
      "너는 블로그 제목 생성기다.",
      "반드시 JSON 스키마를 따르고 한국어 제목 1개만 생성한다.",
      "과장/허위 표현을 피하고 자연스러운 클릭 유도형 제목을 만든다.",
      "제목은 60자 이내로 유지한다.",
      "제목의 마지막은 반드시 메인 키워드로 끝나야 한다.",
      "이모지와 마크다운(**) 표기는 사용하지 않는다."
    ].join(" ");
    const user = [
      `키워드: ${keyword}`,
      `의도: ${intent}`,
      `금지: 기존 제목과 유사한 문장`,
      `기존 제목 목록: ${oldTitles.slice(0, 30).join(" | ")}`
    ].join("\n");

    try {
      const { out, cacheHash, usage } = await callOpenAiStructuredCached({
        task: "title",
        normalizedRequest,
        schemaVersion: SCHEMA_VERSION,
        promptVersion,
        model: MODEL_DEFAULT,
        schemaName: "blog_title_v1",
        jsonSchema: TitleJsonSchema,
        system,
        user,
        zod: TitleOutZ,
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

      const llmTitle = finalizeTitle(out.title.trim(), keyword);
      if (llmTitle) {
        const llmSim = maxTitleSimilarity(llmTitle, oldTitles);
        if (llmSim < 0.8) {
          picked = llmTitle;
          pickedSim = llmSim;
        }
      }
    } catch {
      // fallback: keep deterministic candidate result
    }
  }

  const nowIso = new Date().toISOString();
  const regenThreshold = 0.3;
  const regenCandidates = candidates
    .map((title) => ({ title, sim: maxTitleSimilarity(title, oldTitles) }))
    .sort((a, b) => a.sim - b.sim)
    .map((x) => x.title)
    .filter((x) => x !== picked)
    .slice(0, 3);

  await aRef.set(
    {
      siteId,
      keywordId,
      runDate: payload.runDate,
      dedupeKey: `${siteId}:${keywordId}:${payload.runDate}${runTag && runTag !== "default" ? `:${runTag}` : ""}`,
      intent,
      titleCandidates: candidates,
      titleFinal: picked,
      titleSimMax: pickedSim,
      titleNeedsRegeneration: pickedSim > regenThreshold,
      titleRegenCandidates: pickedSim > regenThreshold ? regenCandidates : [],
      // Never regress status on retries (inline execution may re-run title_generate if downstream fails).
      ...(typeof existingStatus === "string" && existingStatus && existingStatus !== "queued" ? {} : { status: "queued" }),
      // Keep governance separate from pipeline status. Only default when missing; never overwrite.
      ...(typeof existingLifecycle === "string" ? {} : { lifecycle: "draft" }),
      llmUsage: nextLlmUsage,
      createdAt: existingSnap.exists ? existingSnap.get("createdAt") ?? new Date() : new Date(),
      updatedAt: new Date(),
      trace: [
        {
          task: "title_generate",
          at: nowIso,
          ok: true,
          status: "success",
          traceId: payload.traceId,
          retryCount: payload.retryCount
        }
      ]
    },
    { merge: true }
  );

  await enqueueTask({
    queue: "heavy",
    payload: {
      ...payload,
      taskType: "body_generate",
      idempotencyKey: `body_generate:${siteId}:${payload.runDate}:${articleId}${runTag ? `:${runTag}` : ""}`,
      articleId
    }
  });

  if (budgetExceeded) {
    return {
      finalState: "skipped",
      lastErrorCode: "BUDGET_EXCEEDED",
      lastErrorMessage: "daily budget exceeded; LLM call skipped"
    };
  }
  if (capExceeded) {
    return {
      finalState: "skipped",
      lastErrorCode: "CAP_EXCEEDED",
      lastErrorMessage: "caps.titleLLMMax exceeded; LLM call skipped"
    };
  }
}
