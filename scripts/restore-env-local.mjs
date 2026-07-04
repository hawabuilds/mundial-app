import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const basePath =
  process.env.ENV_RESTORE_BASE?.trim() ||
  path.join(
    process.env.USERPROFILE ?? "",
    "Documents",
    "projects",
    "guess-the-score",
    ".env.local",
  );
const outPath = path.join(root, ".env.local");

function parseEnv(content) {
  const map = new Map();
  const order = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!map.has(key)) order.push(key);
    map.set(key, value);
  }
  return { map, order };
}

if (!fs.existsSync(basePath)) {
  console.error(`Base env not found: ${basePath}`);
  process.exit(1);
}

const base = parseEnv(fs.readFileSync(basePath, "utf8"));
const overlay = parseEnv(
  fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "",
);

const txlineSolana = {
  TXODDS_API_TOKEN:
    overlay.map.get("TXODDS_API_TOKEN") ??
    "txoracle_api_769adb1f9f964f44a8ef6eca77a26008",
  TXODDS_API_ORIGIN:
    overlay.map.get("TXODDS_API_ORIGIN") ??
    "https://txline-dev.txodds.com",
  MUNDIAL_REWARDS_PROGRAM_ID:
    overlay.map.get("MUNDIAL_REWARDS_PROGRAM_ID") ??
    "2GvW9gBcFmmUcoQDoBVQe9rpR1dGzD4uTdaLzzwRzRz9",
  USDC_MINT:
    overlay.map.get("USDC_MINT") ??
    "GYLbKj6RdYRDZXwDFUezoa8yBE8EbbzErzx4x4ArjzbY",
  NEXT_PUBLIC_USDC_MINT:
    overlay.map.get("NEXT_PUBLIC_USDC_MINT") ??
    overlay.map.get("USDC_MINT") ??
    "GYLbKj6RdYRDZXwDFUezoa8yBE8EbbzErzx4x4ArjzbY",
  SOLANA_RPC_URL:
    overlay.map.get("SOLANA_RPC_URL") ?? "https://api.devnet.solana.com",
  NEXT_PUBLIC_SOLANA_RPC_URL:
    overlay.map.get("NEXT_PUBLIC_SOLANA_RPC_URL") ??
    overlay.map.get("SOLANA_RPC_URL") ??
    "https://api.devnet.solana.com",
  SOLANA_CLUSTER: overlay.map.get("SOLANA_CLUSTER") ?? "devnet",
  SOLANA_SIGNER_SECRET_KEY:
    overlay.map.get("SOLANA_SIGNER_SECRET_KEY") ??
    "[172,217,63,29,157,121,102,94,10,33,53,118,134,104,168,35,15,12,125,185,126,184,188,165,238,164,112,38,179,227,180,212,123,43,241,34,161,75,138,162,190,29,9,63,86,144,2,120,172,184,171,22,38,144,237,179,104,127,22,100,116,42,249,219]",
  SOLANA_OPERATOR_SECRET_KEY:
    overlay.map.get("SOLANA_OPERATOR_SECRET_KEY") ??
    "[149,168,15,163,202,247,112,239,114,185,8,190,12,72,72,171,108,205,142,203,9,60,152,24,234,7,165,225,208,213,122,193,94,123,90,158,157,231,15,236,68,254,65,201,69,202,160,72,253,47,108,7,216,215,254,18,174,253,202,35,89,169,65,230]",
};

for (const [key, value] of Object.entries(txlineSolana)) {
  if (value) base.map.set(key, value);
}

if (!base.map.get("AUTH_URL")) {
  base.map.set("AUTH_URL", "http://localhost:3000");
}

const sections = [
  {
    comment: "# Auth (X / NextAuth)",
    keys: [
      "AUTH_SECRET",
      "AUTH_TWITTER_ID",
      "AUTH_TWITTER_SECRET",
      "AUTH_URL",
    ],
  },
  {
    comment: "# Supabase",
    keys: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  },
  {
    comment: "# X API + crons",
    keys: ["X_BEARER_TOKEN", "X_MATCH_ACCOUNT", "CRON_SECRET", "COLLECT_SECRET"],
  },
  {
    comment: "# TxLINE (TxODDS)",
    keys: ["TXODDS_API_TOKEN", "TXODDS_API_ORIGIN"],
  },
  {
    comment: "# Legacy football APIs (optional)",
    keys: ["FOOTBALL_DATA_API_KEY", "API_FOOTBALL_KEY"],
  },
  {
    comment: "# Solana devnet (mundial_rewards)",
    keys: [
      "MUNDIAL_REWARDS_PROGRAM_ID",
      "USDC_MINT",
      "NEXT_PUBLIC_USDC_MINT",
      "SOLANA_RPC_URL",
      "NEXT_PUBLIC_SOLANA_RPC_URL",
      "SOLANA_CLUSTER",
      "SOLANA_SIGNER_SECRET_KEY",
      "SOLANA_OPERATOR_SECRET_KEY",
    ],
  },
  {
    comment: "# BNB legacy payout (non-copa host)",
    keys: [
      "SIGNER_PRIVATE_KEY",
      "PAYOUT_CONTRACT_ADDRESS",
      "PAYOUT_CHAIN_ID",
      "NEXT_PUBLIC_PAYOUT_CONTRACT_ADDRESS",
      "NEXT_PUBLIC_PAYOUT_CHAIN_ID",
      "PAYOUT_OPERATOR_PRIVATE_KEY",
    ],
  },
  {
    comment: "# Ops",
    keys: ["BOUNTY_ADMIN_HANDLES", "FIRST_SNAPSHOT_EPOCH_ID"],
  },
];

const used = new Set();
const lines = [];

for (const section of sections) {
  const present = section.keys.filter((key) => base.map.has(key));
  if (present.length === 0) continue;
  lines.push(section.comment);
  for (const key of present) {
    lines.push(`${key}=${base.map.get(key)}`);
    used.add(key);
  }
  lines.push("");
}

for (const key of base.order) {
  if (used.has(key) || !base.map.has(key)) continue;
  lines.push(`${key}=${base.map.get(key)}`);
}

fs.writeFileSync(outPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Keys: ${[...base.map.keys()].sort().join(", ")}`);
