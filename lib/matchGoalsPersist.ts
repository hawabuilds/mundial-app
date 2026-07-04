import {
  finalizeMatchGoals,
  getMatchGoals,
  mergeMatchGoals,
  saveMatchGoals,
  type StoredGoal,
} from "@/app/lib/supabase";
import type { MatchGoal } from "./apiFootball";
import {
  extractActionGoals,
  extractGoals,
  type TxGoal,
  type TxScoreEvent,
} from "./txodds";

export function mapTxGoalsToMatchGoals(
  txGoals: TxGoal[],
  homeIsP1: boolean,
): MatchGoal[] {
  return txGoals.map((goal) => ({
    minute: goal.minute,
    side: (goal.participant === 1 ? homeIsP1 : !homeIsP1) ? "home" : "away",
    player: goal.player,
    ownGoal: goal.ownGoal,
  }));
}

export function matchGoalsFromEvents(
  events: TxScoreEvent[],
  homeIsP1: boolean,
  mode: "display" | "persist",
): MatchGoal[] {
  const txGoals =
    mode === "persist" ? extractActionGoals(events) : extractGoals(events);
  return mapTxGoalsToMatchGoals(txGoals, homeIsP1);
}

/** Play-by-play rows only — period-stat placeholders are not persisted. */
export function isPersistableGoal(goal: MatchGoal): boolean {
  return goal.minute != null || goal.player != null;
}

export async function persistTxlineGoals(
  fixtureId: number,
  goals: MatchGoal[],
): Promise<void> {
  const persistable = goals.filter(isPersistableGoal) as StoredGoal[];
  if (persistable.length === 0) return;
  try {
    await saveMatchGoals(fixtureId, persistable);
  } catch {
    // Supabase optional — live feed still works without the accumulator table.
  }
}

export async function loadStoredMatchGoals(
  fixtureId: number,
): Promise<StoredGoal[]> {
  try {
    return await getMatchGoals(fixtureId);
  } catch {
    return [];
  }
}

/**
 * Merge goals captured during live TxLINE polls with the current snapshot.
 * Stored play-by-play wins over post-match stat-only rows that lack scorers.
 */
export async function resolveMatchGoalsForDisplay(input: {
  fixtureId: number;
  freshGoals: MatchGoal[];
  homeScore: number | null;
  awayScore: number | null;
}): Promise<MatchGoal[]> {
  const { fixtureId, freshGoals, homeScore, awayScore } = input;
  const stored = await loadStoredMatchGoals(fixtureId);
  const merged = mergeMatchGoals(stored, freshGoals as StoredGoal[]);
  return finalizeMatchGoals(merged, homeScore, awayScore);
}
