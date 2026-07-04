/**
 * Audit TxLINE goal times + scorers vs our extractGoals output.
 * Usage: npx tsx scripts/audit-txline-goals.mjs [fixtureId]
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
for (const name of [".env.local", ".env.production.local"]) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

const fixtureId = Number(process.argv[2] || 18175918);

const { fetchScoresSnapshot, extractGoals, latestScoreEvent } = await import("../lib/txodds.ts");
const { fetchMatchWithGoals, mapMatchRow } = await import("../lib/apiFootball.ts");
const { getTxScheduleBoard } = await import("../lib/txScheduleBoard.ts");

const events = await fetchScoresSnapshot(fixtureId);
const latest = latestScoreEvent(events);
const lineups = events.find((e) => e.Action === "lineups");
const nameById = new Map();
for (const team of lineups?.Lineups ?? []) {
  for (const entry of team.lineups ?? []) {
    const id = entry.player?.normativeId;
    const name = entry.player?.preferredName;
    if (id != null && name) nameById.set(id, name);
  }
}

function fmtPlayer(id) {
  if (id == null) return null;
  const raw = nameById.get(id);
  if (!raw) return `id:${id}`;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length >= 2 && parts[1]) return `${parts[1]} ${parts[0]}`;
  return raw;
}

function secToMin(sec) {
  if (sec == null) return null;
  return Math.floor(sec / 60);
}

console.log("=== FIXTURE", fixtureId, "===");
console.log("StatusId", latest?.StatusId, "Totals", latest?.Stats?.["1"], "-", latest?.Stats?.["2"]);

console.log("\n=== PER-PERIOD GOAL STATS (non-zero) ===");
const periodKeys = [
  [1001, 1002, "H1"],
  [2001, 2002, "H1-end?"],
  [3001, 3002, "H2"],
  [4001, 4002, "ET1"],
  [5001, 5002, "ET1-end?"],
  [6001, 6002, "?"],
  [7001, 7002, "ET-total"],
];
const stats = latest?.Stats ?? {};
for (const [k1, k2, label] of periodKeys) {
  const v1 = stats[String(k1)];
  const v2 = stats[String(k2)];
  if ((v1 ?? 0) > 0 || (v2 ?? 0) > 0) {
    console.log(label, `P1=${v1 ?? 0}`, `P2=${v2 ?? 0}`);
  }
}

console.log("\n=== ALL goal + action_amend events ===");
for (const e of [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0))) {
  if (e.Action === "goal") {
    const pid = e.Data?.PlayerId;
    console.log(
      "GOAL seq", e.Seq,
      "clock", e.Clock?.Seconds, `(${secToMin(e.Clock?.Seconds)}')`,
      "P", e.Participant,
      "player", fmtPlayer(pid) ?? e.Data?.PreferredName ?? "—",
      "type", e.Data?.GoalType ?? "",
    );
  }
  if (e.Action === "action_amend" && e.Data?.Action === "goal") {
    const n = e.Data.New ?? {};
    const pid = n.PlayerId;
    console.log(
      "AMEND seq", e.Seq,
      "clock", n.Clock?.Seconds ?? e.Clock?.Seconds, `(${secToMin(n.Clock?.Seconds ?? e.Clock?.Seconds)}')`,
      "P", e.Participant,
      "player", fmtPlayer(pid) ?? "—",
      "type", n.GoalType ?? "",
      "prev", JSON.stringify(e.Data.Previous ?? {}),
    );
  }
}

console.log("\n=== STATS TOTAL PROGRESSION ===");
let t1 = 0, t2 = 0;
for (const e of [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0))) {
  const v1 = e.Stats?.["1"];
  const v2 = e.Stats?.["2"];
  if (v1 == null && v2 == null) continue;
  const n1 = v1 ?? t1;
  const n2 = v2 ?? t2;
  if (n1 !== t1 || n2 !== t2) {
    console.log(
      "seq", e.Seq, e.Action,
      "clock", e.Clock?.Seconds, `(${secToMin(e.Clock?.Seconds) ?? "?"}')`,
      `${t1}-${t2} -> ${n1}-${n2}`,
    );
    t1 = n1; t2 = n2;
  }
}

console.log("\n=== extractGoals() ===");
console.log(JSON.stringify(extractGoals(events), null, 2));

const { match, goals } = await fetchMatchWithGoals({
  id: fixtureId,
  home: "Argentina",
  away: "Cape Verde",
  date: "2026-07-03",
  time: "22:00",
});
console.log("\n=== fetchMatchWithGoals (board path) ===");
console.log("score", match ? mapMatchRow(match) : null);
console.log("goals", JSON.stringify(goals, null, 2));

const board = await getTxScheduleBoard();
const row = board.find((r) => r.id === fixtureId);
console.log("\n=== board API row ===");
console.log("live", row?.live);
console.log("goals", JSON.stringify(row?.goals, null, 2));
