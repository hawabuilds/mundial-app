import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { getMatchGoals, getMatchState } from "../app/lib/supabase";
import { fetchScoresSnapshot, latestScoreEvent } from "../lib/txodds";
import { deriveMatchGoalsFromScoreSequence, loadScoreEventsForBackfill } from "../lib/backfillMatchGoals";

const TX = 18202701;
const MATCH = 80;

function regulationScore(events: Awaited<ReturnType<typeof fetchScoresSnapshot>>) {
  const last = latestScoreEvent(events);
  const s = last?.Stats;
  if (!s) return null;
  const h1 = (s["1001"] ?? 0) + (s["3001"] ?? 0);
  const a1 = (s["1002"] ?? 0) + (s["3002"] ?? 0);
  // Regulation = H1+H2 stat keys only
  const home = (s["1001"] ?? 0) + (s["3001"] ?? 0);
  const away = (s["1002"] ?? 0) + (s["3002"] ?? 0);
  // Use regulation keys per settlement semantics
  const regHome = (s["1001"] ?? 0) + (s["3001"] ?? 0);
  const regAway = (s["1002"] ?? 0) + (s["3002"] ?? 0);
  return { home: regHome, away: regAway, statusId: last?.StatusId, raw: { "1001": s["1001"], "1002": s["1002"], "3001": s["3001"], "3002": s["3002"] } };
}

async function main() {
  const state = await getMatchState(MATCH);
  console.log("match_state", state);
  const before = await getMatchGoals(TX);
  console.log("match_goals before", before);

  const snap = await fetchScoresSnapshot(TX);
  console.log("regulation from snapshot", regulationScore(snap));

  const events = await loadScoreEventsForBackfill(TX);
  const derived = deriveMatchGoalsFromScoreSequence(events, true, 0, 1);
  console.log("derived 0-1", derived);
  const derived31 = deriveMatchGoalsFromScoreSequence(events, true, 3, 1);
  console.log("derived 3-1", derived31);
}

main().catch(console.error);
