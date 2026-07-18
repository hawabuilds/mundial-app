import type { StoredGoal } from "@/app/lib/supabase";

export type FirstGoalscorer = {
  side: "home" | "away";
  playerId: number | null;
  player: string | null;
  playerShort: string | null;
  clockSeconds: number | null;
  minute: number | null;
  seq: number | null;
  ownGoal: boolean;
  penalty: boolean;
};

function toFirstGoalscorer(goal: StoredGoal): FirstGoalscorer {
  return {
    side: goal.side,
    playerId: goal.playerId ?? null,
    player: goal.player,
    playerShort: goal.playerShort,
    clockSeconds: goal.clockSeconds ?? null,
    minute: goal.minute,
    seq: goal.seq ?? null,
    ownGoal: goal.ownGoal,
    penalty: goal.penalty,
  };
}

/** Order goals for first-scorer resolution — Clock.Seconds, then Seq, not minute alone. */
export function orderGoalsByEventTime(goals: StoredGoal[]): StoredGoal[] {
  return [...goals].sort(compareGoalsByEventTime);
}

export function compareGoalsByEventTime(a: StoredGoal, b: StoredGoal): number {
  const aClock = a.clockSeconds;
  const bClock = b.clockSeconds;
  if (aClock != null && bClock != null && aClock !== bClock) {
    return aClock - bClock;
  }
  if (aClock != null && bClock == null) return -1;
  if (aClock == null && bClock != null) return 1;

  const aSeq = a.seq;
  const bSeq = b.seq;
  if (aSeq != null && bSeq != null && aSeq !== bSeq) return aSeq - bSeq;
  if (aSeq != null && bSeq == null) return -1;
  if (aSeq == null && bSeq != null) return 1;

  return (a.minute ?? 999) - (b.minute ?? 999);
}

/** Play-by-play rows with event clock are authoritative for first scorer. */
export function isPlayByPlayGoal(goal: StoredGoal): boolean {
  return goal.clockSeconds != null;
}

export function deriveFirstGoalscorer(
  goals: StoredGoal[],
): FirstGoalscorer | null {
  const candidates = goals.filter(isPlayByPlayGoal);
  const ordered =
    candidates.length > 0
      ? orderGoalsByEventTime(candidates)
      : orderGoalsByEventTime(
          goals.filter((goal) => goal.minute != null || goal.player != null),
        );

  const first = ordered[0];
  if (!first) return null;

  return toFirstGoalscorer(first);
}

/**
 * First goalscorer for the prediction market — skips own goals (credit goes to
 * the benefiting side, but the OG taker is not the market answer). Scored
 * in-play penalties count.
 */
export function deriveMarketFirstGoalscorer(
  goals: StoredGoal[],
): FirstGoalscorer | null {
  const playByPlay = goals.filter((goal) => !goal.ownGoal && isPlayByPlayGoal(goal));
  const fallback = goals.filter(
    (goal) => !goal.ownGoal && (goal.minute != null || goal.player),
  );
  const pool = playByPlay.length > 0 ? playByPlay : fallback;
  if (pool.length === 0) return null;

  const first = orderGoalsByEventTime(pool)[0];
  if (!first?.player?.trim()) return null;

  return toFirstGoalscorer(first);
}
