import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { BodyGeneratePayload } from "../schema";
import { buildImagePlan } from "../../../../packages/shared/imagePlan";
import { buildTopCardPoints } from "../../../../packages/shared/topCardPoints";
import { getGlobalSettings } from "../../lib/globalSettings";
import { canUseLlm, bumpLlmUsage, getLlmUsage } from "../../lib/llmUsage";
import { callOpenAiStructuredCached, MODEL_DEFAULT, MODEL_QUALITY } from "../../lib/llm/openai";
import { BodyJsonSchema, BodyOutZ, SCHEMA_VERSION } from "../../lib/llm/schemas";

type ArticleDoc = {
  keywordId?: string;
  intent?: "howto" | "compare" | "price" | "review" | "risk" | "info";
  k12?: {
    main: [string, string];
    longtail: string[];
    inflow: string[];
  };
  titleFinal?: string;
  hashtags12?: string[];
};

type KeywordDoc = { text?: string };

export async function bodyGenerate(payload: BodyGeneratePayload) {
  const { siteId, articleId } = payload;
  const settings = await getGlobalSettings();

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;
  await aRef.set({ status: "generating" }, { merge: true });
  const llmUsage = getLlmUsage((a as { llmUsage?: unknown }).llmUsage);
  const useLlm = Boolean(process.env.OPENAI_API_KEY) && canUseLlm("body", llmUsage, settings.caps);
  const nextLlmUsage = useLlm ? bumpLlmUsage(llmUsage, "body") : llmUsage;

  const kwSnap = await db().doc(`keywords/${a.keywordId}`).get();
  const kw = (kwSnap.data() ?? {}) as KeywordDoc;
  const keywordText = String(kw.text ?? "");
  const intent = a.intent ?? "info";

  const k12 =
    a.k12 ??
    {
      main: [keywordText, `${keywordText} 방법`] as [string, string],
      longtail: [
        `${keywordText} 하는법`,
        `${keywordText} 비교`,
        `${keywordText} 장단점`,
        `${keywordText} 추천`,
        `${keywordText} 정리`
      ],
      inflow: [
        `${keywordText} 가격`,
        `${keywordText} 후기`,
        `${keywordText} 주의`,
        `${keywordText} 리스크`,
        `${keywordText} 가성비`
      ]
    };

  const imagePlan = buildImagePlan(intent);
  const { labelsShort } = buildTopCardPoints(k12, intent);
  const guideText =
    `${keywordText}을(를) 실제로 적용할 때는 단계를 짧게 나누고, ` +
    `실행 후 결과를 기록해 다음 선택을 조정하는 방식이 가장 안정적입니다. ` +
    `처음에는 완벽함보다 재현 가능한 루틴을 만드는 것이 중요하며, ` +
    `작은 실패 사례를 빠르게 정리해 같은 실수를 줄이는 것이 핵심입니다.`;
  const detailBlock = Array.from({ length: 8 }, () => `<p>${guideText}</p>`).join("\n");

  let html = `<div class="entry-content">
<p>${a.titleFinal}... 도입부(PAS) 120~150자</p>

<div style="border:2px solid #d4af37; padding:12px; border-radius:10px;">
<p>목차</p>
</div>

<hr />
<h2 style="border-left:5px solid #d4af37; padding-left:15px; color:#333; line-height:1.4; margin-bottom:20px;">소제목 1</h2>
<p>2~3문장 단락으로...</p>
${detailBlock}

<hr />
<h2 style="border-left:5px solid #d4af37; padding-left:15px; color:#333; line-height:1.4; margin-bottom:20px;">소제목 2</h2>
<table style="border:2px solid #d4af37; width:100%; border-collapse:collapse;">
<tr><th style="border:1px solid #d4af37; padding:10px;">비교 항목</th><th style="border:1px solid #d4af37; padding:10px;">설명</th></tr>
<tr><td style="border:1px solid #d4af37; padding:10px;">포인트</td><td style="border:1px solid #d4af37; padding:10px;">...</td></tr>
</table>
${detailBlock}

<hr />
<h2 style="border-left:5px solid #d4af37; padding-left:15px; color:#333; line-height:1.4; margin-bottom:20px;">소제목 3</h2>
<div style="background-color:#e6f7ff; border-left:5px solid #1890ff; padding:15px; margin:20px 0; color:#555;"><strong>TIP:</strong> ...</div>

<hr />
<h2 style="border-left:5px solid #d4af37; padding-left:15px; color:#333; line-height:1.4; margin-bottom:20px;">소제목 4</h2>
<p>FAQ: 자주 묻는 질문</p>
${detailBlock}

<div style="border:2px solid #d4af37; padding:12px; border-radius:10px;">
<p>핵심 요약 3줄</p>
</div>

<div style="background-color:#ffe6e6; border-left:5px solid #ff4d4d; padding:15px; margin:20px 0; color:#555;"><strong>주의:</strong> ...</div>

<p>따뜻한 멘트 + 댓글/공감 유도</p>
</div>`;
  let hashtags12 = a.hashtags12 ?? Array.from({ length: 12 }, (_, i) => `#tag${i + 1}`);

  if (useLlm) {
    const normalizedRequest = {
      keyword: keywordText.trim(),
      title: String(a.titleFinal ?? "").trim(),
      intent,
      k12
    };
    const promptVersion = "2026-02-12";
    const system = [
      "너는 네이버/티스토리용 HTML 본문 생성기다.",
      "응답은 반드시 JSON 스키마를 따라야 한다.",
      "본문은 실용적이고 읽기 쉬운 한국어로 작성한다."
    ].join(" ");
    const user = [
      `키워드: ${normalizedRequest.keyword}`,
      `제목: ${normalizedRequest.title}`,
      `의도: ${normalizedRequest.intent}`,
      `k12.main: ${k12.main.join(" / ")}`,
      `k12.longtail: ${k12.longtail.join(" / ")}`,
      `k12.inflow: ${k12.inflow.join(" / ")}`,
      "요구사항:",
      "- html은 2500~3000자 내외",
      "- hr은 최소 4개",
      "- h2는 최소 4개",
      "- table 또는 FAQ 포함",
      "- hashtags12는 #으로 시작하는 항목 12개"
    ].join("\n");

    try {
      const preferQuality = process.env.OPENAI_BODY_USE_QUALITY === "1";
      const { out } = await callOpenAiStructuredCached({
        task: "body",
        normalizedRequest,
        schemaVersion: SCHEMA_VERSION,
        promptVersion,
        model: preferQuality ? MODEL_QUALITY : MODEL_DEFAULT,
        schemaName: "blog_body_v1",
        jsonSchema: BodyJsonSchema,
        system,
        user,
        zod: BodyOutZ,
        ttlDays: 30
      });
      html = out.html;
      hashtags12 = out.hashtags12;
    } catch {
      // fallback: keep deterministic template body
    }
  }

  await aRef.set(
    {
      k12,
      imagePlan,
      topCardDraft: { labelsShort },
      hashtags12,
      html,
      llmUsage: nextLlmUsage,
      status: "generating"
    },
    { merge: true }
  );

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "article_qa",
      idempotencyKey: `article_qa:${siteId}:${payload.runDate}:${articleId}`,
      articleId
    }
  });
}
