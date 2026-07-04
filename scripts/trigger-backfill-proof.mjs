import { config } from "dotenv";
config({ path: ".env.local" });

const secret =
  process.env.COLLECT_SECRET?.trim() || process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("Set COLLECT_SECRET or CRON_SECRET");
  process.exit(1);
}

const url =
  process.env.BACKFILL_PROOF_URL?.trim() ||
  "https://copamundial.app/api/admin/backfill-proof";

async function main() {
  const matchId = Number.parseInt(process.argv[2] ?? "74", 10);
  const force = process.argv.includes("--force");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      "x-collect-secret": secret,
    },
    body: JSON.stringify({ matchId, force }),
  });

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text.slice(0, 2000));
  }
  process.exit(response.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
