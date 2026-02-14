import { createCanvas } from "@napi-rs/canvas";
import { bucket } from "./admin";

export type PaidImageResult = {
  storagePath: string;
  provider: string;
  prompt: string;
};

function renderPlaceholder(prompt: string): Buffer {
  const W = 1200;
  const H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#f6f2e6");
  grad.addColorStop(1, "#e9e2d0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 8;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  ctx.fillStyle = "#222";
  ctx.font = "bold 38px Sans";
  ctx.fillText("PAID IMAGE", 70, 100);

  ctx.fillStyle = "#333";
  ctx.font = "24px Sans";
  const short = prompt.replace(/\s+/g, " ").slice(0, 80);
  ctx.fillText(short, 70, 150);

  ctx.fillStyle = "#777";
  ctx.font = "20px Sans";
  ctx.fillText("provider: placeholder", 70, 210);

  return canvas.toBuffer("image/png");
}

export async function generatePaidImages(args: {
  siteId: string;
  articleId: string;
  count: number;
  prompt: string;
}) {
  const provider = (process.env.PAID_IMAGE_PROVIDER ?? "").toLowerCase();
  if (!provider) return [] as PaidImageResult[];
  if (provider !== "placeholder") return [] as PaidImageResult[];

  const out: PaidImageResult[] = [];
  for (let i = 0; i < args.count; i++) {
    const png = renderPlaceholder(args.prompt);
    const path = `sites/${args.siteId}/articles/${args.articleId}/paid-${i + 1}.png`;
    const file = bucket().file(path);
    await file.save(png, { contentType: "image/png", resumable: false });
    out.push({ storagePath: path, provider, prompt: args.prompt });
  }
  return out;
}
