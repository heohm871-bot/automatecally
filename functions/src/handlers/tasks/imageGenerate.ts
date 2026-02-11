import { db } from "../../lib/admin";
import { isE2eSkipExternalFetch } from "../../lib/e2eFlags";
import { searchPixabay } from "../../lib/imageSearch/pixabay";
import { searchDuckDuckGoFallback } from "../../lib/imageSearch/duckduckgo";
import type { ImageGeneratePayload } from "../schema";

type ArticleImage = {
  slot: string;
  kind: string;
  source?: unknown;
  sourceUrl?: string;
  pageUrl?: string;
  licenseUrl?: string;
  author?: string;
  downloadedAt?: string;
  alt?: string;
};

type ArticleDoc = {
  titleFinal?: string;
  keywordId?: string;
  images?: ArticleImage[];
};

export async function imageGenerate(payload: ImageGeneratePayload) {
  const { articleId } = payload;

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  if (isE2eSkipExternalFetch()) {
    await aRef.set({ images: a.images ?? [] }, { merge: true });
    return;
  }

  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    await aRef.set({ images: a.images ?? [] }, { merge: true });
    return;
  }

  const q = String(a.titleFinal ?? a.keywordId ?? "").slice(0, 80);
  const pix = await searchPixabay({ q, apiKey, perPage: 30 });
  const picked = pix.slice(0, 2);
  let fallback: Array<{ imageUrl: string; pageUrl: string; licenseUrl?: string; author?: string; provider: string }> = [];
  if (picked.length < 2) {
    const ddg = await searchDuckDuckGoFallback(q);
    fallback = ddg.map((d) => ({
      provider: d.provider,
      imageUrl: d.imageUrl,
      pageUrl: d.pageUrl,
      licenseUrl: d.licenseNote
    }));
  }

  const images = (a.images ?? []).filter((x) => x.slot !== "h2_1" && x.slot !== "h2_3");
  const first = picked[0] ?? fallback[0];
  const second = picked[1] ?? fallback[1];
  const downloadedAt = new Date().toISOString();
  if (first) {
    images.push({
      slot: "h2_1",
      kind: "photo",
      source: first,
      sourceUrl: first.imageUrl,
      pageUrl: first.pageUrl,
      licenseUrl: first.licenseUrl,
      author: first.author,
      downloadedAt,
      alt: "h2_1"
    });
  }
  if (second) {
    images.push({
      slot: "h2_3",
      kind: "photo",
      source: second,
      sourceUrl: second.imageUrl,
      pageUrl: second.pageUrl,
      licenseUrl: second.licenseUrl,
      author: second.author,
      downloadedAt,
      alt: "h2_3"
    });
  }

  await aRef.set({ images }, { merge: true });
}
