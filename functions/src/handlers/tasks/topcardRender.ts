import { db, bucket } from "../../lib/admin";
import { isE2eSkipStorage } from "../../lib/e2eFlags";
import { renderTopCardPng } from "../../lib/topCardRenderer";
import type { TopcardRenderPayload } from "../schema";
import { buildTopCardPoints } from "../../../../packages/shared/topCardPoints";

type ArticleDoc = {
  k12: {
    main: [string, string];
    longtail: string[];
    inflow: string[];
  };
  intent: "howto" | "compare" | "price" | "review" | "risk" | "info";
  titleFinal?: string;
  images?: Array<Record<string, unknown>>;
};

export async function topcardRender(payload: TopcardRenderPayload) {
  const { siteId, articleId } = payload;

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as Partial<ArticleDoc>;
  if (!a.k12 || !a.intent) throw new Error("article missing k12/intent");

  const { points, labelsShort } = buildTopCardPoints(a.k12, a.intent);
  const titleShort = String(a.titleFinal ?? "").replace(/\s+/g, " ").slice(0, 18);

  const png = renderTopCardPng({ titleShort, labelsShort });

  const path = `sites/${siteId}/articles/${articleId}/top.png`;
  if (!isE2eSkipStorage()) {
    const file = bucket().file(path);
    await file.save(png, { contentType: "image/png", resumable: false });
  }

  await aRef.set(
    {
      topCard: {
        templateId: "gold_v1",
        points,
        labelsShort
      },
      images: [...(a.images ?? []), { slot: "top", kind: "top_card", storagePath: path, alt: titleShort }]
    },
    { merge: true }
  );
}
