import { bucket, db } from "../../lib/admin";
import { isE2eSkipStorage } from "../../lib/e2eFlags";
import type { ArticlePackagePayload } from "../schema";

type ArticleDoc = {
  titleFinal?: string;
  intent?: string;
  hashtags12?: string[];
  images?: Array<Record<string, unknown>>;
  html?: string;
};

export async function articlePackage(payload: ArticlePackagePayload) {
  const { siteId, articleId } = payload;

  const aSnap = await db().doc(`articles/${articleId}`).get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  const meta = {
    siteId,
    articleId,
    title: a.titleFinal,
    intent: a.intent,
    hashtags12: a.hashtags12,
    images: a.images ?? [],
    createdAt: new Date().toISOString()
  };

  const base = `sites/${siteId}/articles/${articleId}/package`;

  if (!isE2eSkipStorage()) {
    await bucket().file(`${base}/title.txt`).save(String(a.titleFinal ?? ""), { resumable: false });
    await bucket().file(`${base}/post.html`).save(String(a.html ?? ""), {
      resumable: false,
      contentType: "text/html"
    });
    await bucket().file(`${base}/meta.json`).save(JSON.stringify(meta, null, 2), {
      resumable: false,
      contentType: "application/json"
    });
  }

  await db().doc(`articles/${articleId}`).set({ packagePath: base, status: "packaged" }, { merge: true });
}
