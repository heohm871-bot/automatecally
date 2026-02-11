import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { TitleGeneratePayload } from "../schema";
import { detectIntent } from "../../../../packages/shared/intent";
import { maxTitleSimilarity } from "../../../../packages/shared/titleSimilarity";

type KeywordDoc = { text?: string };
type ArticleDoc = { titleFinal?: string };

const A = (shock: string, situation: string, kw: string) => `"${shock}" ${situation} ${kw}`;
const B = (lack: string, num: number, kw: string) => `${lack} ${num}가지 ${kw}`;
const C = (place: string, target: string, kw: string) => `${place}에서 ${target} ${kw}`;

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
  out.push(`${keyword} 비교: 딱 1개만 고르면 됩니다`);
  out.push(`${keyword} 방법: 초보가 바로 써먹는 순서`);
  out.push(`${keyword} 주의: 이 2가지만은 피하세요`);
  out.push(`${keyword} 후기: 생각보다 갈리는 포인트`);
  out.push(`${keyword} 정리: 지금 필요한 건 이것뿐`);
  out.push(`${keyword} 가성비: 돈 아끼는 선택지 3개`);

  return out.map((t) => t.replace(/\s+/g, " ").trim());
}

export async function titleGenerate(payload: TitleGeneratePayload) {
  const { siteId, keywordId } = payload;

  const kwSnap = await db().doc(`keywords/${keywordId}`).get();
  if (!kwSnap.exists) throw new Error("keyword not found");
  const kw = (kwSnap.data() ?? {}) as KeywordDoc;
  const keyword = String(kw.text ?? "").trim();
  const intent = detectIntent(keyword);

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

  let picked = candidates[0];
  let pickedSim = 1;

  for (const t of candidates) {
    const sim = maxTitleSimilarity(t, oldTitles);
    if (sim < 0.3) {
      picked = t;
      pickedSim = sim;
      break;
    }
    if (sim < pickedSim) {
      picked = t;
      pickedSim = sim;
    }
  }

  const aRef = db().collection("articles").doc();
  const nowIso = new Date().toISOString();
  await aRef.set({
    siteId,
    keywordId,
    intent,
    titleCandidates: candidates,
    titleFinal: picked,
    titleSimMax: pickedSim,
    status: "queued",
    createdAt: new Date(),
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
  });

  await enqueueTask({
    queue: "heavy",
    payload: {
      ...payload,
      taskType: "body_generate",
      idempotencyKey: `body_generate:${siteId}:${aRef.id}`,
      articleId: aRef.id
    }
  });
}
