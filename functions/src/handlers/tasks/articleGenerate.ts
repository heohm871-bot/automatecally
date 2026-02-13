import { db } from "../../lib/admin";
import { enqueueTask } from "../../lib/tasks";
import type { ArticleGeneratePayload } from "../schema";
import { buildImagePlan } from "../../../../packages/shared/imagePlan";
import { detectIntent } from "../../../../packages/shared/intent";

type KeywordDoc = {
  text?: string;
  clusterId?: string;
};

export async function articleGenerate(payload: ArticleGeneratePayload) {
  const { siteId, keywordId } = payload;

  const kwRef = db().doc(`keywords/${keywordId}`);
  const kwSnap = await kwRef.get();
  if (!kwSnap.exists) throw new Error("keyword not found");
  const kw = (kwSnap.data() ?? {}) as KeywordDoc;
  const keywordText = String(kw.text ?? "");

  const intent = detectIntent(keywordText);
  const imagePlan = buildImagePlan(intent);

  const articleRef = db().collection("articles").doc();
  await articleRef.set({
    siteId,
    keywordId,
    clusterId: kw.clusterId ?? "default",
    intent,
    titleCandidates: [
      `"충격" ${keywordText} 왜 다들 틀릴까`,
      `${keywordText} 7일만에 바뀐 이유`,
      `의외의 장소에서 터진 ${keywordText}`,
      `모르면 손해 ${keywordText} 5가지`,
      `${keywordText} 비교: 이거 하나로 끝`,
      `${keywordText} 초보가 제일 많이 실수하는 포인트`,
      `${keywordText} 지금 시작해도 늦지 않은 이유`
    ],
    titleFinal: `"충격" ${keywordText} 지금부터 달라지는 3가지`,
    hashtags12: Array.from({ length: 12 }, (_, i) => `#tag${i + 1}`),
    k12: {
      main: [keywordText, `${keywordText} 방법`],
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
    },
    imagePlan,
    html: `<div class="entry-content">
      <p>도입부(PAS) ...</p>
      <div style="border:2px solid #d4af37; padding:12px;">목차(TOC)</div>
      <hr />
      <h2 style="border-left:5px solid #d4af37; padding-left:15px;">섹션 1</h2>
      <p>...</p>
      <hr />
      <h2 style="border-left:5px solid #d4af37; padding-left:15px;">섹션 2</h2>
      <table style="border:2px solid #d4af37; width:100%;"><tr><td>표</td></tr></table>
      <hr />
      <h2 style="border-left:5px solid #d4af37; padding-left:15px;">섹션 3</h2>
      <p>...</p>
      <hr />
      <h2 style="border-left:5px solid #d4af37; padding-left:15px;">섹션 4</h2>
      <p>FAQ: 자주 묻는 질문</p>
    </div>`,
    status: "queued",
    lifecycle: "draft",
    createdAt: new Date()
  });

  await enqueueTask({
    queue: "light",
    payload: {
      ...payload,
      taskType: "article_qa",
      idempotencyKey: `article_qa:${siteId}:${articleRef.id}`,
      articleId: articleRef.id
    }
  });
}
