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
  extractGoals,
  fetchScoreSequence,
  fetchScoresSnapshot,
  isTxoddsConfigured,
  resolveTxFixture,
  type TxScoreEvent,
} from "@/lib/txodds";

/** Re-check settled fixtures for missing scorer detail for up to 24h after settlement. */
export const SCORER_BACKFILL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function countGoalsBySide(goals: StoredGoal[]): { home: number; away: number } {
  return {
    home: goals.filter((goal) => goal.side === "home").length,
    away: goals.filter((goal) => goal.side === "away").length,
  };
}

/** True when stored rows don't cover the settled score or lack scorer name/minute. */
export function isMatchGoalsInconsistentWithScore(
  goals: StoredGoal[],
  homeScore: number,
  awayScore: number,
): boolean {
  const counts = countGoalsBySide(goals);
  if (counts.home !== homeScore || counts.away !== awayScore) return true;

  const total = homeScore + awayScore;
  if (total === 0) return false;

  return goals.some((goal) => !goal.player || goal.minute == null);
}

/** Merge historical replay + trimmed snapshot (lineups may only exist in one source). */
export function mergeScoreEventsForBackfill(
  historical: TxScoreEvent[],
  snapshot: TxScoreEvent[],
): TxScoreEvent[] {
  const bySeq = new Map<number, TxScoreEvent>();
  for (const event of [...historical, ...snapshot]) {
    const seq = event.Seq ?? -1;
    const prev = bySeq.get(seq);
    if (
      !prev ||
      (event.Lineups?.length ?? 0) > (prev.Lineups?.length ?? 0)
    ) {
      bySeq.set(seq, event);
    }
  }
  return [...bySeq.values()].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));
}

export async function loadScoreEventsForBackfill(
  txFixtureId: number,
): Promise<TxScoreEvent[]> {
  const historical = await fetchScoreSequence(txFixtureId).catch(() => []);
  const snapshot = await fetchScoresSnapshot(txFixtureId);
  return mergeScoreEventsForBackfill(historical, snapshot);
}

/** Build the complete goal list from a TxLINE score sequence (historical + snapshot). */
export function deriveMatchGoalsFromScoreSequence(
  events: TxScoreEvent[],
  homeIsP1: boolean,
  homeScore: number,
  awayScore: number,
): StoredGoal[] {
  const txGoals = extractGoals(events);
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

    const events = await loadScoreEventsForBackfill(txFixtureId);
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
    if (derived.length === 0) {
      return {
        status: "error",
        matchId: matchId ?? 0,
        error: `Score sequence has no recoverable goals for TxLINE fixture ${txFixtureId}`,
      };
    }
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

export type ScorerBackfillRetryResult = {
  attempted: number;
  backfilled: number;
  skipped: number;
  errors: number;
  details: Array<{
    matchId: number;
    status: "backfilled" | "skipped" | "error";
    reason?: string;
  }>;
};

/**
 * Self-healing pass: re-backfill settled fixtures with incomplete scorer rows
 * until historical replay fills names/minutes (capped at 24h after settlement).
 */
export async function retryIncompleteMatchGoalsBackfills(
  fixtures: Fixture[],
): Promise<ScorerBackfillRetryResult> {
  const summary: ScorerBackfillRetryResult = {
    attempted: 0,
    backfilled: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  if (!isTxoddsConfigured()) return summary;

  for (const fixture of fixtures) {
    try {
      if (!(await isMatchScored(fixture.id).catch(() => false))) continue;

      const state = await getMatchState(fixture.id);
      const homeScore = state?.final_home_score;
      const awayScore = state?.final_away_score;
      if (typeof homeScore !== "number" || typeof awayScore !== "number") {
        continue;
      }

      const scoredAtMs = state?.scored_at
        ? Date.parse(state.scored_at)
        : Number.NaN;
      if (
        !Number.isFinite(scoredAtMs) ||
        Date.now() - scoredAtMs > SCORER_BACKFILL_MAX_AGE_MS
      ) {
        continue;
      }

      const txFixtureId = fixture.externalFixtureId;
      if (txFixtureId == null || txFixtureId <= 0) continue;

      const stored = await getMatchGoals(txFixtureId).catch(() => [] as StoredGoal[]);
      if (!isMatchGoalsInconsistentWithScore(stored, homeScore, awayScore)) {
        continue;
      }

      summary.attempted += 1;
      const result = await backfillMatchGoals(fixture.id);
      if (result.status === "backfilled") {
        summary.backfilled += 1;
        summary.details.push({ matchId: fixture.id, status: "backfilled" });
        console.info(
          `[match-goals] Retry backfilled match ${fixture.id}: ${result.before.length} → ${result.after.length} rows`,
        );
      } else if (result.status === "skipped") {
        summary.skipped += 1;
        summary.details.push({
          matchId: fixture.id,
          status: "skipped",
          reason: result.reason,
        });
      } else {
        summary.errors += 1;
        summary.details.push({
          matchId: fixture.id,
          status: "error",
          reason: result.error,
        });
      }
    } catch (error) {
      summary.errors += 1;
      summary.details.push({
        matchId: fixture.id,
        status: "error",
        reason: error instanceof Error ? error.message : "retry failed",
      });
    }
  }

  return summary;
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
