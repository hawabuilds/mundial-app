import path from "node:path";
import {
  createCanvas,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import {
  LB_TIERS,
  tierForRank,
  type LeaderboardTier,
} from "@/app/data/leaderboard";
import type { LeaderboardEntry } from "@/app/lib/supabase";
import {
  avatarInitialsFromHandle,
  fetchLeaderboardAvatar,
} from "@/lib/leaderboardAvatarFetch";
import { registerShareCardFonts } from "@/lib/shareCardFonts";

const SCALE = 2;
const W = 1080 * SCALE;
const H = 2040 * SCALE;

const BLACK = "#000000";
const BRAND_BLUE = "#2f7bff";
const BRAND_BLUE_SOFT = "rgba(47, 123, 255, 0.12)";
const BRAND_BLUE_BORDER = "rgba(47, 123, 255, 0.35)";
const SURFACE_RAISED = "#111111";
const BORDER_STRONG = "rgba(255, 255, 255, 0.14)";
const BORDER = "rgba(255, 255, 255, 0.08)";
const TEXT_PRIMARY = "#ffffff";
const TEXT_MUTED = "rgba(201, 210, 224, 0.55)";
const TEXT_DIM = "rgba(255, 255, 255, 0.38)";

const TIER_STYLE = {
  tier1: {
    pillBg: BRAND_BLUE_SOFT,
    pillText: BRAND_BLUE,
    pillBorder: BRAND_BLUE_BORDER,
    rowGlow: "rgba(255, 217, 90, 0.18)",
    rowAccent: "#ffd95a",
  },
  tier2: {
    pillBg: SURFACE_RAISED,
    pillText: TEXT_PRIMARY,
    pillBorder: BORDER_STRONG,
    rowGlow: BRAND_BLUE_SOFT,
    rowAccent: BRAND_BLUE,
  },
  tier3: {
    pillBg: "rgba(255, 255, 255, 0.03)",
    pillText: TEXT_MUTED,
    pillBorder: BORDER,
    rowGlow: "rgba(255, 255, 255, 0.04)",
    rowAccent: "rgba(255, 255, 255, 0.2)",
  },
} as const;

const MEDAL = {
  1: { label: "🥇", accent: "#ffd95a" },
  2: { label: "🥈", accent: "#d4d8e0" },
  3: { label: "🥉", accent: "#d48b5c" },
} as const;

const px = (n: number) => n * SCALE;

type RenderRow =
  | { kind: "tier"; tier: LeaderboardTier }
  | { kind: "player"; entry: LeaderboardEntry };

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

function formatUtcDateLabel(epochId: bigint): string {
  const s = String(epochId).padStart(8, "0");
  const date = new Date(
    Date.UTC(
      parseInt(s.slice(0, 4), 10),
      parseInt(s.slice(4, 6), 10) - 1,
      parseInt(s.slice(6, 8), 10),
    ),
  );
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatHandle(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return "—";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function truncateHandle(ctx: SKRSContext2D, handle: string, maxWidth: number): string {
  if (ctx.measureText(handle).width <= maxWidth) return handle;
  let out = handle;
  while (out.length > 2 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function buildRenderRows(standings: LeaderboardEntry[]): RenderRow[] {
  const rows: RenderRow[] = [];
  let lastTier: LeaderboardTier | undefined;

  for (const entry of standings) {
    const tier = tierForRank(entry.rank);
    if (tier && tier !== lastTier) {
      rows.push({ kind: "tier", tier });
      lastTier = tier;
    }
    rows.push({ kind: "player", entry });
  }

  return rows;
}

function drawTierHeader(
  ctx: SKRSContext2D,
  tier: LeaderboardTier,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const style = TIER_STYLE[tier.pillClass];
  const pillH = px(28);
  const pillY = y + (height - pillH) / 2;

  ctx.font = `700 ${px(12)}px Inter`;
  const nameW = ctx.measureText(tier.name.toUpperCase()).width + px(24);
  const pillW = Math.max(px(88), nameW);

  roundRect(ctx, x, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = style.pillBg;
  ctx.fill();
  ctx.strokeStyle = style.pillBorder;
  ctx.lineWidth = px(1.5);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.pillText;
  ctx.fillText(tier.name.toUpperCase(), x + pillW / 2, pillY + pillH / 2);

  ctx.textAlign = "left";
  ctx.font = `600 ${px(13)}px Inter`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText(tier.range, x + pillW + px(12), y + height / 2);
}

function drawAvatar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  radius: number,
  image: Image | null,
  initials: string,
  stroke: string,
) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1f2e";
  ctx.fill();
  ctx.lineWidth = px(2);
  ctx.strokeStyle = stroke;
  ctx.stroke();

  if (image) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - px(2), 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      image,
      cx - radius,
      cy - radius,
      radius * 2,
      radius * 2,
    );
    ctx.restore();
    return;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${px(14)}px Inter`;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.fillText(initials, cx, cy);
}

export type RenderLeaderboardImageInput = {
  epochId: bigint;
  standings: LeaderboardEntry[];
};

/** Renders a portrait PNG of the daily top-20 leaderboard (2× logical scale). */
export async function renderLeaderboardImage(
  input: RenderLeaderboardImageInput,
): Promise<Buffer> {
  registerShareCardFonts();

  const standings = input.standings.slice(0, 20);
  const dateLabel = formatUtcDateLabel(input.epochId);
  const renderRows = buildRenderRows(standings);

  const avatars = await Promise.all(
    standings.map((entry) => fetchLeaderboardAvatar(entry.user_handle)),
  );
  const avatarByUserId = new Map(
    standings.map((entry, index) => [entry.user_id, avatars[index] ?? null]),
  );

  const logoPath = path.join(process.cwd(), "public", "mundial-logo.jpg");
  let brandLogo: Image | null = null;
  try {
    brandLogo = await loadImage(logoPath);
  } catch {
    brandLogo = null;
  }

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.5, px(120), 0, W * 0.5, px(120), px(420));
  glow.addColorStop(0, "rgba(47, 123, 255, 0.1)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const padX = px(56);
  const headerTop = px(52);
  const logoSize = px(52);

  if (brandLogo) {
    roundRect(ctx, padX, headerTop, logoSize, logoSize, px(10));
    ctx.save();
    roundRect(ctx, padX, headerTop, logoSize, logoSize, px(10));
    ctx.clip();
    ctx.drawImage(brandLogo, padX, headerTop, logoSize, logoSize);
    ctx.restore();
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${px(34)}px Syne`;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.fillText("Daily Leaderboard", padX, headerTop + logoSize + px(34));

  ctx.font = `600 ${px(20)}px Inter`;
  ctx.fillStyle = BRAND_BLUE;
  ctx.fillText(dateLabel, padX, headerTop + logoSize + px(64));

  ctx.font = `600 ${px(14)}px Inter`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText("Top 20 · 3 USDC tiers", padX, headerTop + logoSize + px(92));

  const tableTop = headerTop + logoSize + px(118);
  const tableBottom = H - px(96);
  const tierHeaderCount = LB_TIERS.length;
  const tierHeaderH = px(40);
  const playerRowH =
    (tableBottom - tableTop - tierHeaderCount * tierHeaderH) /
    Math.max(standings.length, 1);

  const rankColW = px(56);
  const avatarColW = px(52);
  const pointsColW = px(108);
  const handleMaxW =
    W - padX * 2 - rankColW - avatarColW - pointsColW - px(28);

  let y = tableTop;

  for (const row of renderRows) {
    if (row.kind === "tier") {
      drawTierHeader(ctx, row.tier, padX, y, W - padX * 2, tierHeaderH);
      y += tierHeaderH;
      continue;
    }

    const entry = row.entry;
    const rowTop = y;
    const rowCenterY = rowTop + playerRowH / 2;
    const tier = tierForRank(entry.rank);
    const tierStyle = tier ? TIER_STYLE[tier.pillClass] : TIER_STYLE.tier3;
    const medal = MEDAL[entry.rank as 1 | 2 | 3];
    const avatar = avatarByUserId.get(entry.user_id) ?? null;

    if (medal) {
      ctx.fillStyle = tierStyle.rowGlow;
      roundRect(
        ctx,
        padX - px(6),
        rowTop + px(4),
        W - padX * 2 + px(12),
        playerRowH - px(8),
        px(12),
      );
      ctx.fill();
      ctx.fillStyle = medal.accent;
      roundRect(ctx, padX - px(6), rowTop + px(4), px(5), playerRowH - px(8), px(3));
      ctx.fill();
    } else if (tier?.pillClass === "tier2") {
      ctx.fillStyle = tierStyle.rowGlow;
      roundRect(
        ctx,
        padX - px(4),
        rowTop + px(6),
        W - padX * 2 + px(8),
        playerRowH - px(12),
        px(10),
      );
      ctx.fill();
    } else if (entry.rank % 2 === 0) {
      ctx.fillStyle = tierStyle.rowGlow;
      roundRect(
        ctx,
        padX - px(4),
        rowTop + px(6),
        W - padX * 2 + px(8),
        playerRowH - px(12),
        px(10),
      );
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (medal) {
      ctx.font = `700 ${px(22)}px Inter`;
      ctx.fillStyle = TEXT_PRIMARY;
      ctx.fillText(medal.label, padX + rankColW / 2, rowCenterY);
    } else {
      ctx.font = `700 ${px(18)}px Inter`;
      ctx.fillStyle = TEXT_DIM;
      ctx.fillText(String(entry.rank), padX + rankColW / 2, rowCenterY);
    }

    const avatarCx = padX + rankColW + avatarColW / 2;
    const avatarR = px(18);
    drawAvatar(
      ctx,
      avatarCx,
      rowCenterY,
      avatarR,
      avatar,
      avatarInitialsFromHandle(entry.user_handle),
      medal?.accent ?? tierStyle.rowAccent,
    );

    ctx.textAlign = "left";
    ctx.font = `700 ${px(20)}px Inter`;
    ctx.fillStyle = medal ? TEXT_PRIMARY : "rgba(255, 255, 255, 0.88)";
    const handle = truncateHandle(
      ctx,
      formatHandle(entry.user_handle),
      handleMaxW,
    );
    ctx.fillText(handle, padX + rankColW + avatarColW + px(8), rowCenterY);

    ctx.textAlign = "right";
    ctx.font = `800 ${px(22)}px Inter`;
    ctx.fillStyle = medal ? medal.accent : BRAND_BLUE;
    ctx.fillText(String(entry.total_points), W - padX, rowCenterY);

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, rowTop + playerRowH - px(2));
    ctx.lineTo(W - padX, rowTop + playerRowH - px(2));
    ctx.stroke();

    y += playerRowH;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${px(16)}px Inter`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText(
    "Live standings → copamundial.app · Solana devnet",
    W / 2,
    H - px(42),
  );

  return canvas.toBuffer("image/png");
}

export function formatLeaderboardDiscordDate(epochId: bigint): string {
  return formatUtcDateLabel(epochId);
}
