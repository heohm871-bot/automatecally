import { createCanvas } from "@napi-rs/canvas";
import type { InfoType } from "../../../packages/shared/imagePlan";

export type InfographicInput = {
  title: string;
  infoType: InfoType;
  labels: string[];
};

function truncateText(text: string, maxLen: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 3))}...`;
}

function padLabels(labels: string[], size: number) {
  const out = labels.filter(Boolean);
  while (out.length < size) out.push(`포인트 ${out.length + 1}`);
  return out.slice(0, size);
}

function drawBox(ctx: any, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#f9f7f2";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function drawHeading(ctx: any, title: string) {
  ctx.fillStyle = "#222";
  ctx.font = "bold 40px Sans";
  ctx.fillText(truncateText(title, 26), 70, 90);
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 115);
  ctx.lineTo(1130, 115);
  ctx.stroke();
}

export function renderInfographicPng(input: InfographicInput): Buffer {
  const W = 1200;
  const H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 8;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  drawHeading(ctx, input.title);

  const labels = padLabels(input.labels, 4);

  if (input.infoType === "flow") {
    const boxW = 280;
    const boxH = 160;
    const startX = 90;
    const y = 220;
    const gap = 120;

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (boxW + gap);
      drawBox(ctx, x, y, boxW, boxH);
      ctx.fillStyle = "#333";
      ctx.font = "bold 26px Sans";
      ctx.fillText(truncateText(labels[i], 10), x + 24, y + 90);
      if (i < 2) {
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 4;
        const arrowX = x + boxW + 20;
        const arrowY = y + boxH / 2;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX + 60, arrowY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(arrowX + 60, arrowY);
        ctx.lineTo(arrowX + 46, arrowY - 10);
        ctx.lineTo(arrowX + 46, arrowY + 10);
        ctx.closePath();
        ctx.fillStyle = "#d4af37";
        ctx.fill();
      }
    }
  } else if (input.infoType === "checklist") {
    const startX = 140;
    const startY = 210;
    const rowH = 120;
    for (let i = 0; i < 4; i++) {
      const y = startY + i * rowH;
      drawBox(ctx, startX, y, 920, 90);
      ctx.strokeStyle = "#4caf50";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(startX + 40, y + 45, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(startX + 32, y + 48);
      ctx.lineTo(startX + 40, y + 58);
      ctx.lineTo(startX + 54, y + 36);
      ctx.stroke();
      ctx.fillStyle = "#333";
      ctx.font = "bold 26px Sans";
      ctx.fillText(truncateText(labels[i], 16), startX + 80, y + 58);
    }
  } else if (input.infoType === "compare" || input.infoType === "proscons") {
    const leftX = 120;
    const rightX = 640;
    const y = 230;
    const boxW = 440;
    const boxH = 420;
    drawBox(ctx, leftX, y, boxW, boxH);
    drawBox(ctx, rightX, y, boxW, boxH);
    ctx.fillStyle = "#333";
    ctx.font = "bold 30px Sans";
    ctx.fillText(input.infoType === "proscons" ? "장점" : "옵션 A", leftX + 24, y + 50);
    ctx.fillText(input.infoType === "proscons" ? "단점" : "옵션 B", rightX + 24, y + 50);
    ctx.font = "24px Sans";
    ctx.fillText(truncateText(labels[0], 16), leftX + 24, y + 120);
    ctx.fillText(truncateText(labels[1], 16), leftX + 24, y + 170);
    ctx.fillText(truncateText(labels[2], 16), rightX + 24, y + 120);
    ctx.fillText(truncateText(labels[3], 16), rightX + 24, y + 170);
  } else if (input.infoType === "matrix" || input.infoType === "riskmap") {
    const gridX = 140;
    const gridY = 210;
    const gridW = 920;
    const gridH = 460;
    drawBox(ctx, gridX, gridY, gridW, gridH);
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gridX + gridW / 2, gridY);
    ctx.lineTo(gridX + gridW / 2, gridY + gridH);
    ctx.moveTo(gridX, gridY + gridH / 2);
    ctx.lineTo(gridX + gridW, gridY + gridH / 2);
    ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.font = "bold 22px Sans";
    ctx.fillText(truncateText(labels[0], 12), gridX + 30, gridY + 60);
    ctx.fillText(truncateText(labels[1], 12), gridX + gridW / 2 + 30, gridY + 60);
    ctx.fillText(truncateText(labels[2], 12), gridX + 30, gridY + gridH / 2 + 60);
    ctx.fillText(truncateText(labels[3], 12), gridX + gridW / 2 + 30, gridY + gridH / 2 + 60);
    if (input.infoType === "riskmap") {
      ctx.font = "20px Sans";
      ctx.fillText("영향 낮음", gridX + 30, gridY + gridH + 40);
      ctx.fillText("영향 높음", gridX + gridW - 160, gridY + gridH + 40);
      ctx.save();
      ctx.translate(gridX - 40, gridY + gridH - 10);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("가능성 높음", 0, 0);
      ctx.restore();
    }
  } else if (input.infoType === "scenario") {
    const startX = 140;
    const startY = 210;
    const boxW = 920;
    const boxH = 120;
    const gap = 30;
    for (let i = 0; i < 3; i++) {
      const y = startY + i * (boxH + gap);
      drawBox(ctx, startX, y, boxW, boxH);
      ctx.fillStyle = "#333";
      ctx.font = "bold 26px Sans";
      ctx.fillText(`시나리오 ${i + 1}`, startX + 26, y + 48);
      ctx.font = "22px Sans";
      ctx.fillText(truncateText(labels[i], 20), startX + 26, y + 86);
    }
  } else {
    const startX = 140;
    const startY = 220;
    const rowH = 120;
    for (let i = 0; i < 4; i++) {
      const y = startY + i * rowH;
      drawBox(ctx, startX, y, 920, 90);
      ctx.fillStyle = "#333";
      ctx.font = "bold 26px Sans";
      ctx.fillText(truncateText(labels[i], 16), startX + 30, y + 58);
    }
  }

  return canvas.toBuffer("image/png");
}
