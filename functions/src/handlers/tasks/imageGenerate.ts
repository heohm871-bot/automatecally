import { db } from "../../lib/admin";
import { isE2eSkipExternalFetch } from "../../lib/e2eFlags";
import { searchPixabay } from "../../lib/imageSearch/pixabay";
import type { ImageGeneratePayload } from "../schema";

type ArticleImage = {
  slot: string;
  kind: string;
  source?: unknown;
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

  const images = (a.images ?? []).filter((x) => x.slot !== "h2_1" && x.slot !== "h2_3");
  if (picked[0]) images.push({ slot: "h2_1", kind: "photo", source: picked[0], alt: "h2_1" });
  if (picked[1]) images.push({ slot: "h2_3", kind: "photo", source: picked[1], alt: "h2_3" });

  await aRef.set({ images }, { merge: true });
}
