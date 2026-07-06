import { fixtureDateTime, getFixtureById, type Fixture } from "@/app/data/fixtures";
import {
  finalizeMatchGoals,
  getMatchGoals,
  getMatchState,
  isMatchScored,
  upsertMatchGoals,
  type StoredGoal,
} from "@/app/lib/supabase";
import { mapTxGoalsToMatchGoals } from "@/lib/matchGoalsPersist";
import {
  extractActionGoals,
  fetchScoreSequence,
  fetchScoresSnapshot,
  isTxoddsConfigured,
  resolveTxFixture,
  type TxScoreEvent,
} from "@/lib/txodds";

export function countGoalsBySide(goals: StoredGoal[]): { home: number; away: number } {
  return {
    home: goals.filter((goal) => goal.side === "home").length,
    away: goals.filter((goal) => goal.side === "away").length,
  };
}

/** True when stored rows don't cover the settled score or lack scorer names. */
export function isMatchGoalsInconsistentWithScore(
  goals: StoredGoal[],
  homeScore: number,
  awayScore: number,
): boolean {
  const counts = countGoalsBySide(goals);
  if (counts.home !== homeScore || counts.away !== awayScore) return true;

  const total = homeScore + awayScore;
  if (total === 0) return false;

  const named = goals.filter((goal) => goal.player).length;
  return named < total;
}

/** Build the complete goal list from a TxLINE historical score sequence. */
export function deriveMatchGoalsFromScoreSequence(
  events: TxScoreEvent[],
  homeIsP1: boolean,
  homeScore: number,
  awayScore: number,
): StoredGoal[] {
  const txGoals = extractActionGoals(events);
  const mapped = mapTxGoalsToMatchGoals(txGoals, homeIsP1) as StoredGoal[];
  return finalizeMatchGoals(mapped, homeScore, awayScore);
}

export type BackfillMatchGoalsResult =
  | {
      status: "skipped";
      matchId: number;
      txFixtureId: number;
      reason: string;
      before: StoredGoal[];
      after: StoredGoal[];
    }
  | {
      status: "backfilled";
      matchId: number;
      txFixtureId: number;
      homeScore: number;
      awayScore: number;
      before: StoredGoal[];
      after: StoredGoal[];
      sequenceEvents: number;
    }
  | {
      status: "error";
      matchId: number;
      error: string;
    };

export type BackfillTxFixtureResult =
  | (Omit<
      Extract<BackfillMatchGoalsResult, { status: "backfilled" }>,
      "matchId"
    > & { matchId: number | null })
  | Extract<BackfillMatchGoalsResult, { status: "skipped" }>;

/** Backfill by TxLINE fixture id (manual repair when registry match id is unknown). */
export async function backfillMatchGoalsByTxFixture(input: {
  txFixtureId: number;
  homeScore: number;
  awayScore: number;
  homeIsP1?: boolean;
  matchId?: number | null;
}): Promise<BackfillTxFixtureResult | Extract<BackfillMatchGoalsResult, { status: "error" }>> {
  const {
    txFixtureId,
    homeScore,
    awayScore,
    homeIsP1 = true,
    matchId = null,
  } = input;

  try {
    if (!isTxoddsConfigured()) {
      return { status: "error", matchId: matchId ?? 0, error: "TXODDS_API_TOKEN is not configured" };
    }

    const before = await getMatchGoals(txFixtureId).catch(() => [] as StoredGoal[]);

    if (!isMatchGoalsInconsistentWithScore(before, homeScore, awayScore)) {
      return {
        status: "skipped",
        matchId: matchId ?? 0,
        txFixtureId,
        reason: "match_goals already consistent with final score",
        before,
        after: before,
      };
    }

    let events = await fetchScoreSequence(txFixtureId);
    if (events.length === 0) {
      events = await fetchScoresSnapshot(txFixtureId);
    }
    if (events.length === 0) {
      return {
        status: "error",
        matchId: matchId ?? 0,
        error: `No score sequence for TxLINE fixture ${txFixtureId}`,
      };
    }

    const derived = deriveMatchGoalsFromScoreSequence(
      events,
      homeIsP1,
      homeScore,
      awayScore,
    );
    const { after } = await upsertMatchGoals(txFixtureId, derived);

    return {
      status: "backfilled",
      matchId,
      txFixtureId,
      homeScore,
      awayScore,
      before,
      after,
      sequenceEvents: events.length,
    };
  } catch (error) {
    return {
      status: "error",
      matchId: matchId ?? 0,
      error: error instanceof Error ? error.message : "Backfill failed",
    };
  }
}

async function resolveTxFixtureForMatch(
  matchId: number,
  fixture: Fixture,
): Promise<{ txFixtureId: number; homeIsP1: boolean } | null> {
  if (fixture.externalFixtureId && fixture.externalFixtureId > 0) {
    const txFixture = await resolveTxFixture(
      fixture.home,
      fixture.away,
      fixtureDateTime(fixture).getTime(),
    );
    return {
      txFixtureId: fixture.externalFixtureId,
      homeIsP1: txFixture?.Participant1IsHome ?? true,
    };
  }

  const txFixture = await resolveTxFixture(
    fixture.home,
    fixture.away,
    fixtureDateTime(fixture).getTime(),
  );
  if (!txFixture) return null;
  return {
    txFixtureId: txFixture.FixtureId,
    homeIsP1: txFixture.Participant1IsHome,
  };
}

/**
 * Backfill match_goals for a settled Mundial registry match from the TxLINE
 * historical score sequence. Idempotent — merges with live-synced rows.
 */
export async function backfillMatchGoals(matchId: number): Promise<BackfillMatchGoalsResult> {
  try {
    if (!isTxoddsConfigured()) {
      return { status: "error", matchId, error: "TXODDS_API_TOKEN is not configured" };
    }

    const fixture = getFixtureById(matchId);
    if (!fixture) {
      return { status: "error", matchId, error: `Unknown match id ${matchId}` };
    }

    const scored = await isMatchScored(matchId).catch(() => false);
    if (!scored) {
      return {
        status: "error",
        matchId,
        error: "Match is not settled in match_state yet",
      };
    }

    const matchState = await getMatchState(matchId);
    const homeScore = matchState?.final_home_score;
    const awayScore = matchState?.final_away_score;
    if (typeof homeScore !== "number" || typeof awayScore !== "number") {
      return {
        status: "error",
        matchId,
        error: "Final score missing from match_state",
      };
    }

    const resolved = await resolveTxFixtureForMatch(matchId, fixture);
    if (!resolved) {
      return {
        status: "error",
        matchId,
        error: "Could not resolve TxLINE fixture for this match",
      };
    }

    const { txFixtureId, homeIsP1 } = resolved;
    const result = await backfillMatchGoalsByTxFixture({
      txFixtureId,
      homeScore,
      awayScore,
      homeIsP1,
      matchId,
    });

    if (result.status === "error") {
      return { status: "error", matchId, error: result.error };
    }
    if (result.status === "skipped") {
      return {
        status: "skipped",
        matchId,
        txFixtureId: result.txFixtureId,
        reason: result.reason,
        before: result.before,
        after: result.after,
      };
    }

    return {
      status: "backfilled",
      matchId,
      txFixtureId: result.txFixtureId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      before: result.before,
      after: result.after,
      sequenceEvents: result.sequenceEvents,
    };
  } catch (error) {
    return {
      status: "error",
      matchId,
      error: error instanceof Error ? error.message : "Backfill failed",
    };
  }
}

/** After settlement: backfill when match_goals gaps would leave scorers missing. */
export async function ensureMatchGoalsBackfilled(
  matchId: number,
  _fixture: Pick<Fixture, "home" | "away" | "date" | "time" | "externalFixtureId">,
): Promise<void> {
  try {
    if (!isTxoddsConfigured()) return;
    if (!(await isMatchScored(matchId).catch(() => false))) return;

    const fullFixture = getFixtureById(matchId);
    if (!fullFixture) return;

    const result = await backfillMatchGoals(matchId);
    if (result.status === "backfilled") {
      console.info(
        `[match-goals] Backfilled match ${matchId} (TxLINE ${result.txFixtureId}): ${result.before.length} → ${result.after.length} rows (${result.sequenceEvents} sequence events)`,
      );
    } else if (result.status === "skipped") {
      console.info(
        `[match-goals] Skipped backfill for match ${matchId}: ${result.reason}`,
      );
    } else {
      console.warn(
        `[match-goals] Backfill failed for match ${matchId}: ${result.error}`,
      );
    }
  } catch (error) {
    console.warn(
      `[match-goals] Unexpected backfill error for match ${matchId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
