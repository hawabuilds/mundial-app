import { mergeMatchGoals, finalizeMatchGoals } from "../app/lib/supabase.ts";
import { extractGoals, fetchScoresSnapshot } from "../lib/txodds.ts";

const stored = [
  { minute: 28, side: "home", player: "Lionel Messi", ownGoal: false },
  { minute: 58, side: "away", player: "Deroy Duarte", ownGoal: false },
  { minute: 102, side: "away", player: "Sidny Lopes Cabral", ownGoal: false },
];

const events = await fetchScoresSnapshot(18175918);
const fresh = extractGoals(events).map((g) => ({
  minute: g.minute,
  side: g.participant === 1 ? "home" : "away",
  player: g.player,
  ownGoal: g.ownGoal,
}));

const merged = finalizeMatchGoals(mergeMatchGoals(stored, fresh), 3, 2);
console.log(JSON.stringify(merged, null, 2));
