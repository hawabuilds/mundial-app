import path from "node:path";
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1600;
const H = 900;
const cq = (n: number) => n * 16;
const PAD_L = W * 0.048;
const PAD_T = H * 0.072;
const NAVY = "#050812";

let fontsRegistered = false;

function registerFonts() {
  if (fontsRegistered) return;
  const dir = path.join(process.cwd(), "assets", "share-card-fonts");
  const reg = (file: string, family: string) => {
    try {
      GlobalFonts.registerFromPath(path.join(dir, file), family);
    } catch {
      /* fall back to default sans if a face is missing */
    }
  };
  reg("inter-latin-600-normal.woff2", "Inter");
  reg("inter-latin-700-normal.woff2", "Inter");
  reg("inter-latin-800-normal.woff2", "Inter");
  reg("syne-latin-800-normal.woff2", "Syne");
  reg("outfit-latin-600-normal.woff2", "Outfit");
  fontsRegistered = true;
}

function fillTextLS(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  ls: number,
) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + ls;
  }
}

function fillCenteredInBox(
  ctx: SKRSContext2D,
  text: string,
  centerX: number,
  boxTop: number,
  boxHeight: number,
) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent ?? 0;
  const desc = m.actualBoundingBoxDescent ?? 0;
  const y = boxTop + boxHeight / 2 + (asc - desc) / 2;
  ctx.fillText(text, centerX, y);
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawMasks(ctx: SKRSContext2D) {
  const left = ctx.createLinearGradient(0, 0, W, 0);
  left.addColorStop(0, NAVY);
  left.addColorStop(0.43, NAVY);
  left.addColorStop(0.49, "rgba(5, 8, 18, 0.98)");
  left.addColorStop(0.57, "rgba(5, 8, 18, 0.7)");
  left.addColorStop(0.65, "rgba(5, 8, 18, 0)");
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, W, H);

  const footer = ctx.createLinearGradient(0, H, 0, H * 0.88);
  footer.addColorStop(0, "rgba(5, 8, 18, 0.35)");
  footer.addColorStop(0.35, NAVY);
  footer.addColorStop(0.65, "rgba(5, 8, 18, 0.94)");
  footer.addColorStop(1, "rgba(5, 8, 18, 0)");
  ctx.fillStyle = footer;
  ctx.fillRect(0, H * 0.88, W, H * 0.12);
}

async function fetchImage(url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "mundial/1.0" } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

type CardParams = {
  brand: string;
  winner: string;
  handle: string;
  initials: string;
  tier: string;
  day: string;
  prize: string;
  amount: string;
  unit: string;
  sub: string;
  tag: string;
  avatar: string;
};

export async function GET(request: NextRequest) {
  registerFonts();

  const sp = request.nextUrl.searchParams;
  const p: CardParams = {
    brand: sp.get("brand") ?? "MUNDIAL",
    winner: sp.get("winner") ?? "WINNER",
    handle: sp.get("handle") ?? "",
    initials: sp.get("initials") ?? "",
    tier: sp.get("tier") ?? "",
    day: sp.get("day") ?? "",
    prize: sp.get("prize") ?? "PRIZE WON",
    amount: sp.get("amount") ?? "0.00",
    unit: sp.get("unit") ?? "USDC",
    sub: sp.get("sub") ?? "",
    tag: sp.get("tag") ?? "",
    avatar: sp.get("avatar") ?? "",
  };

  const origin = request.nextUrl.origin;
  const [bg, avatar] = await Promise.all([
    fetchImage(`${origin}/winner-card-ref.png`),
    p.avatar ? fetchImage(p.avatar) : Promise.resolve(null),
  ]);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  if (bg) {
    ctx.drawImage(bg, 0, 0, W, H);
  } else {
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, H);
  }

  drawMasks(ctx);

  const wonSize = cq(10.8);
  const wonY = PAD_T + 28 + wonSize * 0.75;
  const userTop = wonY + cq(3.6);
  const avatarCy = userTop + cq(2.4);
  const avatarR = cq(2.4);
  const avatarCx = PAD_L + avatarR;
  const chipTop = userTop + cq(4.8) + cq(1.65);
  const chipH = cq(4.15);
  const payoutTop = chipTop + chipH + cq(3.4);
  const payoutPad = cq(2.2);
  const labelY = payoutTop + payoutPad + cq(1.95);
  const amountSize = cq(7.2);
  const amountY = labelY + cq(1.25) + amountSize * 0.9;
  const subY = amountY + cq(1.5) + cq(2.05) * 0.5;
  const payoutH = subY - payoutTop + payoutPad;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = `800 ${cq(2.35)}px Inter`;
  ctx.fillStyle = "#ffffff";
  fillTextLS(ctx, p.brand.toUpperCase(), PAD_L, PAD_T + 28, cq(0.5));

  const wonText = p.winner.toUpperCase();
  const wonLS = cq(-0.08);
  // Keep the headline left of the trophy regardless of word/font width.
  const wonMaxWidth = 660;
  ctx.font = `800 ${wonSize}px Inter`;
  let wonWidth = -wonLS;
  for (const ch of wonText) wonWidth += ctx.measureText(ch).width + wonLS;
  const wonScaleX = wonWidth > wonMaxWidth ? wonMaxWidth / wonWidth : 1;

  ctx.save();
  ctx.translate(PAD_L, wonY);
  ctx.scale(wonScaleX, 1);
  ctx.font = `800 ${wonSize}px Inter`;
  ctx.shadowColor = "rgba(59, 130, 246, 0.5)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 7;
  const metal = ctx.createLinearGradient(0, -wonSize, 0, 8);
  metal.addColorStop(0, "#ffffff");
  metal.addColorStop(0.28, "#e8f0ff");
  metal.addColorStop(0.55, "#a8c8ff");
  metal.addColorStop(0.78, "#5b9aff");
  metal.addColorStop(1, "#3b82f6");
  ctx.fillStyle = metal;
  fillTextLS(ctx, wonText, 0, 0, wonLS);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = "#2a3348";
  ctx.fill();
  ctx.lineWidth = cq(0.22);
  ctx.strokeStyle = "#3b82f6";
  ctx.stroke();

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      avatar,
      avatarCx - avatarR,
      avatarCy - avatarR,
      avatarR * 2,
      avatarR * 2,
    );
    ctx.restore();
  } else if (p.initials) {
    ctx.font = `700 ${cq(2.1)}px Inter`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.initials, avatarCx, avatarCy);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  ctx.font = `700 ${cq(3.65)}px Inter`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(p.handle, PAD_L + cq(4.8) + cq(1.5), avatarCy + 12);

  const chipFont = `700 ${cq(2.05)}px Inter`;
  const dayFont = `600 ${cq(2.05)}px Outfit`;
  const chipPad = cq(2.15);

  ctx.font = chipFont;
  const tierW = Math.max(150, ctx.measureText(p.tier).width + chipPad * 2);
  ctx.font = dayFont;
  const dayW = Math.max(290, ctx.measureText(p.day).width + chipPad * 2);

  ctx.fillStyle = "transparent";
  ctx.strokeStyle = "rgba(59, 130, 246, 0.75)";
  ctx.lineWidth = 2.2;
  roundRect(ctx, PAD_L, chipTop, tierW, chipH, chipH / 2);
  ctx.stroke();
  ctx.font = chipFont;
  ctx.fillStyle = "#ffffff";
  fillCenteredInBox(ctx, p.tier, PAD_L + tierW / 2, chipTop, chipH);

  const dayX = PAD_L + tierW + 12;
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 2.2;
  roundRect(ctx, dayX, chipTop, dayW, chipH, chipH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = dayFont;
  ctx.fillStyle = "#ffffff";
  fillCenteredInBox(ctx, p.day, dayX + dayW / 2, chipTop, chipH);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const payoutW = 580;
  ctx.fillStyle = "#080d18";
  ctx.strokeStyle = "rgba(59, 130, 246, 0.38)";
  ctx.lineWidth = 2.2;
  roundRect(ctx, PAD_L, payoutTop, payoutW, payoutH, 16);
  ctx.fill();
  ctx.stroke();

  const payoutX = PAD_L + cq(2.6);
  ctx.font = `700 ${cq(1.9)}px Inter`;
  ctx.fillStyle = "#5eb0ff";
  fillTextLS(ctx, p.prize.toUpperCase(), payoutX, labelY, cq(0.14));

  ctx.font = `800 ${amountSize}px Inter`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(p.amount, payoutX, amountY);
  const amountW = ctx.measureText(p.amount).width;

  const unitSize = cq(3);
  ctx.font = `700 ${unitSize}px Inter`;
  ctx.fillStyle = "#5eb0ff";
  fillTextLS(
    ctx,
    p.unit.toUpperCase(),
    payoutX + amountW + cq(0.45),
    amountY - (amountSize - unitSize) * 0.41,
    cq(0.1),
  );

  ctx.font = `600 ${cq(2.05)}px Outfit`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.fillText(p.sub, payoutX, subY);

  ctx.font = `600 ${cq(2.05)}px Inter`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.textAlign = "center";
  ctx.fillText(p.tag, W / 2, H * 0.974);
  ctx.textAlign = "left";

  const png = canvas.toBuffer("image/png");

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
