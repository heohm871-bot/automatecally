import { bucket, db } from "../../lib/admin";
import { isE2eSkipExternalFetch, isE2eSkipStorage } from "../../lib/e2eFlags";
import { renderInfographicPng } from "../../lib/infographicRenderer";
import { generatePaidImages } from "../../lib/paidImageGenerator";
import { searchPixabay } from "../../lib/imageSearch/pixabay";
import { searchDuckDuckGoFallback } from "../../lib/imageSearch/duckduckgo";
import type { ImageGeneratePayload } from "../schema";
import { buildTopCardPoints } from "../../../../packages/shared/topCardPoints";
import type { ImagePlan, InfoType } from "../../../../packages/shared/imagePlan";
import type { Intent } from "../../../../packages/shared/intent";

type ArticleImage = {
  slot: string;
  kind: string;
  infoType?: InfoType;
  storagePath?: string;
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
  imagePlan?: ImagePlan;
  intent?: Intent;
  k12?: {
    main: [string, string];
    longtail: string[];
    inflow: string[];
  };
  topCardDraft?: { labelsShort?: string[] };
  paidFallback?: { attempted?: boolean; provider?: string | null; requested?: number; created?: number };
};

type PhotoResult = {
  imageUrl: string;
  pageUrl: string;
  licenseUrl?: string;
  author?: string;
  provider: string;
};

async function fetchPhotos(q: string, count: number) {
  const out: PhotoResult[] = [];
  const apiKey = process.env.PIXABAY_API_KEY;
  if (apiKey) {
    try {
      const pix = await searchPixabay({ q, apiKey, perPage: 30 });
      out.push(
        ...pix.map((p) => ({
          provider: "pixabay",
          imageUrl: p.imageUrl,
          pageUrl: p.pageUrl,
          licenseUrl: p.licenseUrl,
          author: p.author
        }))
      );
    } catch {
      // ignore
    }
  }

  if (out.length < count) {
    try {
      const ddg = await searchDuckDuckGoFallback(q);
      out.push(
        ...ddg.map((d) => ({
          provider: d.provider,
          imageUrl: d.imageUrl,
          pageUrl: d.pageUrl,
          licenseUrl: d.licenseNote
        }))
      );
    } catch {
      // ignore
    }
  }

  return out.slice(0, count);
}

export async function imageGenerate(payload: ImageGeneratePayload) {
  const { siteId, articleId } = payload;

  const aRef = db().doc(`articles/${articleId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new Error("article not found");
  const a = (aSnap.data() ?? {}) as ArticleDoc;

  const plan = a.imagePlan ?? {
    h2_1: { kind: "photo" },
    h2_2: { kind: "infographic", infoType: "checklist" },
    h2_3: { kind: "photo" },
    h2_4: { kind: "infographic", infoType: "compare" }
  };

  const labelsShort =
    a.topCardDraft?.labelsShort ??
    (a.k12 && a.intent ? buildTopCardPoints(a.k12, a.intent).labelsShort : [a.titleFinal ?? "포인트1"]);

  const slots = Object.entries(plan).map(([slot, cfg]) => ({
    slot,
    kind: cfg.kind,
    infoType: cfg.infoType
  }));

  const infographicSlots = slots.filter((s) => s.kind === "infographic");
  const photoSlots = slots.filter((s) => s.kind === "photo");

  const nextImages = (a.images ?? []).filter((x) => !slots.find((s) => s.slot === x.slot));

  for (const slot of infographicSlots) {
    const png = renderInfographicPng({
      title: String(a.titleFinal ?? a.keywordId ?? "인포그래픽").slice(0, 40),
      infoType: (slot.infoType ?? "checklist") as InfoType,
      labels: labelsShort
    });
    const path = `sites/${siteId}/articles/${articleId}/infographic-${slot.slot}.png`;
    if (!isE2eSkipStorage()) {
      const file = bucket().file(path);
      await file.save(png, { contentType: "image/png", resumable: false });
    }
    nextImages.push({
      slot: slot.slot,
      kind: "infographic",
      infoType: slot.infoType,
      storagePath: path,
      alt: slot.slot
    });
  }

  let remainingPhotoSlots = photoSlots;
  let paidCreated = 0;
  if (!isE2eSkipExternalFetch() && photoSlots.length > 0) {
    const q = String(a.titleFinal ?? a.keywordId ?? "").slice(0, 80);
    const photos = await fetchPhotos(q, photoSlots.length);
    const downloadedAt = new Date().toISOString();
    for (let i = 0; i < photoSlots.length; i++) {
      const slot = photoSlots[i];
      const pick = photos[i];
      if (!pick) continue;
      nextImages.push({
        slot: slot.slot,
        kind: "photo",
        source: pick,
        sourceUrl: pick.imageUrl,
        pageUrl: pick.pageUrl,
        licenseUrl: pick.licenseUrl,
        author: pick.author,
        downloadedAt,
        alt: slot.slot
      });
    }
    remainingPhotoSlots = photoSlots.filter((_, idx) => !photos[idx]);
  }

  if (remainingPhotoSlots.length > 0 && !isE2eSkipStorage() && !isE2eSkipExternalFetch()) {
    const prompt = String(a.titleFinal ?? a.keywordId ?? "이미지").slice(0, 120);
    const paid = await generatePaidImages({
      siteId,
      articleId,
      count: remainingPhotoSlots.length,
      prompt
    });
    for (let i = 0; i < remainingPhotoSlots.length; i++) {
      const slot = remainingPhotoSlots[i];
      const created = paid[i];
      if (!created) continue;
      paidCreated += 1;
      nextImages.push({
        slot: slot.slot,
        kind: "photo_paid",
        storagePath: created.storagePath,
        source: created,
        alt: slot.slot
      });
    }
    await aRef.set(
      {
        paidFallback: {
          attempted: true,
          provider: paid[0]?.provider ?? null,
          requested: remainingPhotoSlots.length,
          created: paidCreated
        }
      },
      { merge: true }
    );
  }

  const unresolvedPhotoSlots = photoSlots.filter((slot) => !nextImages.some((img) => img.slot === slot.slot));
  if (unresolvedPhotoSlots.length > 0) {
    for (const slot of unresolvedPhotoSlots) {
      const fallbackType = (slot.infoType ?? "checklist") as InfoType;
      const png = renderInfographicPng({
        title: String(a.titleFinal ?? a.keywordId ?? "인포그래픽").slice(0, 40),
        infoType: fallbackType,
        labels: labelsShort
      });
      const path = `sites/${siteId}/articles/${articleId}/fallback-${slot.slot}.png`;
      if (!isE2eSkipStorage()) {
        await bucket().file(path).save(png, { contentType: "image/png", resumable: false });
      }
      nextImages.push({
        slot: slot.slot,
        kind: "infographic_fallback",
        infoType: fallbackType,
        storagePath: path,
        alt: slot.slot
      });
    }
  }

  // Preserve non-plan slots (e.g. top card) that may be written concurrently by other tasks.
  const latestSnap = await aRef.get();
  const latest = (latestSnap.data() ?? {}) as ArticleDoc;
  const preserved = (latest.images ?? []).filter((img) => !slots.some((slot) => slot.slot === img.slot));

  await aRef.set({ images: [...preserved, ...nextImages] }, { merge: true });
}
