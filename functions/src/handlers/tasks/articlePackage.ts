import { bucket, db } from "../../lib/admin";
import { isE2eSkipStorage } from "../../lib/e2eFlags";
import { getGlobalSettings } from "../../lib/globalSettings";
import { moderateArticleContent } from "../../lib/llm/moderation";
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
  const settings = await getGlobalSettings();

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
  const siteSnap = await db().doc(`sites/${siteId}`).get();
  const site = (siteSnap.data() ?? {}) as { publishMode?: "scheduled" | "manual"; publishMinIntervalMin?: number };
  const publishMode = site.publishMode ?? settings.pipeline.publishDefault;
  const publishMinIntervalMin = site.publishMinIntervalMin ?? settings.pipeline.publishMinIntervalMin;
  const scheduledAtIso =
    publishMode === "scheduled" ? new Date(Date.now() + publishMinIntervalMin * 60 * 1000).toISOString() : null;

  const moderation = await moderateArticleContent({
    title: String(a.titleFinal ?? ""),
    html: String(a.html ?? "")
  });

  if (moderation.blocked) {
    await db()
      .doc(`articles/${articleId}`)
      .set(
        {
          status: "moderation_blocked",
          moderation,
          updatedAt: new Date()
        },
        { merge: true }
      );
    return;
  }

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

  await db()
    .doc(`articles/${articleId}`)
    .set(
      {
        packagePath: base,
        status: "packaged",
        publishPlan: {
          mode: publishMode,
          minIntervalMin: publishMinIntervalMin,
          scheduledAt: scheduledAtIso
        },
        moderation
      },
      { merge: true }
    );
}
