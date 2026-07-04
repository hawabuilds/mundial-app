import { config } from "dotenv";
config({ path: ".env.local" });

const base =
  process.env.KICKOFF_URL?.trim() || "https://copamundial.app/api/cron/kickoff";
const secret =
  process.env.CRON_SECRET?.trim() || process.env.COLLECT_SECRET?.trim();

if (!secret) {
  console.error("Set CRON_SECRET or COLLECT_SECRET");
  process.exit(1);
}

const response = await fetch(base, {
  headers: { Authorization: `Bearer ${secret}` },
});

const body = await response.text();
console.log(`HTTP ${response.status}`);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body.slice(0, 2000));
}

process.exit(response.ok ? 0 : 1);
