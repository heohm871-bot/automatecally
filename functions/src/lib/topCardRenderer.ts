import { createCanvas } from "@napi-rs/canvas";

export type TopCardInput = {
  titleShort: string;
  labelsShort: string[];
};

export function renderTopCardPng(input: TopCardInput): Buffer {
  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  ctx.fillStyle = "#222";
  ctx.font = "bold 46px Sans";
  ctx.fillText(input.titleShort, 70, 120);

  const baseY = 230;
  const gapX = 360;
  for (let i = 0; i < 3; i++) {
    const x = 120 + i * gapX;

    ctx.fillStyle = "#f6f6f6";
    ctx.fillRect(x, baseY, 140, 140);
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, baseY, 140, 140);

    ctx.fillStyle = "#333";
    ctx.font = "bold 30px Sans";
    ctx.fillText(input.labelsShort[i] ?? "", x, baseY + 190);
  }

  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 560);
  ctx.lineTo(1130, 560);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}
