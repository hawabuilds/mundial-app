import sharp from "sharp";
import path from "node:path";

const W = 1600;
const H = 900;
const cq = (n) => n * 16;
const padL = W * 0.048;
const padT = H * 0.072;

const ref = path.resolve("public/winner-card-ref.png");
const out = path.resolve("public/celebration-preview.png");

const brand = "MUNDIAL";
const won = "WINNER";
const handle = "@cristiano";
const initials = "CR";
const tier = "Tier 1";
const day = "Today · Jun 14";
const amount = "208.40";
const unit = "USDC";
const sub = "paid on Solana";
const tag = "mundial · predict &amp; win daily";

const wonY = padT + 28 + cq(10.8) * 0.75;
const userTop = wonY + cq(3.6);
const avatarCy = userTop + cq(2.4);
const chipTop = userTop + cq(4.8) + cq(1.65);
const chipH = cq(4.15);
const chipTextY = chipTop + chipH / 2 + cq(2.05) * 0.34;
const payoutTop = chipTop + chipH + cq(3.4);
const payoutPad = cq(2.2);
const labelY = payoutTop + payoutPad + cq(1.95);
const amountY = labelY + cq(1.25) + cq(7.2) * 0.9;
const amountSize = cq(7.2);
const unitSize = cq(3);
const unitDy = -((amountSize - unitSize) / 2) * 0.82;
const subY = amountY + cq(1.5) + cq(2.05) * 0.5;
const payoutH = subY - payoutTop + cq(2.2);

const overlaySvg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="leftMask" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#050812"/>
      <stop offset="43%" stop-color="#050812"/>
      <stop offset="49%" stop-color="#050812" stop-opacity="0.98"/>
      <stop offset="57%" stop-color="#050812" stop-opacity="0.7"/>
      <stop offset="65%" stop-color="#050812" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="footerMask" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#050812" stop-opacity="0.35"/>
      <stop offset="35%" stop-color="#050812"/>
      <stop offset="65%" stop-color="#050812" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#050812" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="28%" stop-color="#e8f0ff"/>
      <stop offset="55%" stop-color="#a8c8ff"/>
      <stop offset="78%" stop-color="#5b9aff"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="7" stdDeviation="16" flood-color="#3b82f6" flood-opacity="0.5"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#leftMask)"/>
  <rect y="${H * 0.88}" width="${W}" height="${H * 0.12}" fill="url(#footerMask)"/>

  <text x="${padL}" y="${padT + 28}" font-family="Inter, Arial, sans-serif"
    font-size="${cq(2.35)}" font-weight="800" letter-spacing="${cq(0.5)}"
    fill="#ffffff">${brand}</text>

  <g filter="url(#glow)">
    <text x="${padL}" y="${wonY}" font-family="Syne, 'Arial Black', sans-serif"
      font-size="${cq(10.8)}" font-weight="800" fill="url(#metal)"
      letter-spacing="${cq(-0.08)}">${won}</text>
  </g>

  <circle cx="${padL + cq(2.4)}" cy="${avatarCy}" r="${cq(2.4)}"
    fill="#2a3348" stroke="#3b82f6" stroke-width="${cq(0.22)}"/>
  <text x="${padL + cq(2.4)}" y="${avatarCy + 10}" text-anchor="middle"
    font-family="Inter, Arial, sans-serif" font-size="${cq(2.1)}"
    font-weight="700" fill="#ffffff">${initials}</text>
  <text x="${padL + cq(4.8) + cq(1.5)}" y="${avatarCy + 12}"
    font-family="Inter, Arial, sans-serif" font-size="${cq(3.65)}" font-weight="700"
    fill="#ffffff">${handle}</text>

  <rect x="${padL}" y="${chipTop}" rx="${chipH / 2}" ry="${chipH / 2}" width="150" height="${chipH}"
    fill="none" stroke="rgba(59,130,246,0.75)" stroke-width="2.2"/>
  <text x="${padL + 75}" y="${chipTextY}" text-anchor="middle" font-family="Inter, Arial, sans-serif"
    font-size="${cq(2.05)}" font-weight="700" fill="#ffffff">${tier}</text>

  <rect x="${padL + 162}" y="${chipTop}" rx="${chipH / 2}" ry="${chipH / 2}" width="290" height="${chipH}"
    fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)" stroke-width="2.2"/>
  <text x="${padL + 162 + 145}" y="${chipTextY}" text-anchor="middle"
    font-family="Outfit, Inter, Arial, sans-serif" font-size="${cq(2.05)}" font-weight="600"
    fill="#ffffff">${day}</text>

  <rect x="${padL}" y="${payoutTop}" rx="16" ry="16" width="580" height="${payoutH}"
    fill="#080d18" stroke="rgba(59,130,246,0.38)" stroke-width="2.2"/>
  <text x="${padL + cq(2.6)}" y="${labelY}" font-family="Inter, Arial, sans-serif"
    font-size="${cq(1.9)}" font-weight="700" letter-spacing="${cq(0.14)}"
    fill="#5eb0ff">PRIZE WON</text>
  <text x="${padL + cq(2.6)}" y="${amountY}"
    font-family="Inter, Arial, sans-serif" font-size="${cq(7.2)}" font-weight="800"
    fill="#ffffff">${amount}<tspan font-family="Inter, Arial, sans-serif" font-size="${unitSize}"
      font-weight="700" letter-spacing="${cq(0.1)}"
      fill="#5eb0ff" dy="${unitDy}" dx="${cq(0.45)}">${unit}</tspan></text>
  <text x="${padL + cq(2.6)}" y="${subY}"
    font-family="Outfit, Inter, Arial, sans-serif" font-size="${cq(2.05)}" font-weight="600"
    fill="rgba(255,255,255,0.62)">${sub}</text>

  <text x="${W / 2}" y="${H * 0.974}" text-anchor="middle" font-family="Inter, Arial, sans-serif"
    font-size="${cq(2.05)}" font-weight="600" fill="rgba(255,255,255,0.3)">${tag}</text>
</svg>`;

const base = await sharp(ref)
  .resize(W, H, { fit: "cover" })
  .toBuffer();

await sharp(base)
  .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
  .png()
  .toFile(out);

console.log("wrote", out);
