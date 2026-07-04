import { getFixtureById } from "@/app/data/fixtures";
import { ensureMatchOddsForFixture } from "@/lib/ensureMatchOdds";
import {
  getMatchState,
  rescoreCollectedMatch,
  scoreMatchPredictions,
  type ScoreMatchResult,
} from "@/app/lib/supabase";

export type RescoreMatchResult =
  | { matchId: number; status: "ok"; result: ScoreMatchResult }
  | { matchId: number; status: "skipped"; reason: string }
  | { matchId: number; status: "error"; error: string };

export async function rescoreMatch(matchId: number): Promise<RescoreMatchResult> {
  try {
    const fixture = getFixtureById(matchId);
    if (!fixture) {
      return { matchId, status: "skipped", reason: `Unknown match id ${matchId}` };
    }

    await ensureMatchOddsForFixture(fixture).catch(() => null);

    const collected = await rescoreCollectedMatch(matchId);
    if (collected) {
      return { matchId, status: "ok", result: collected };
    }

    const state = await getMatchState(matchId);
    if (
      !state?.scored_at ||
      state.final_home_score == null ||
      state.final_away_score == null
    ) {
      return {
        matchId,
        status: "skipped",
        reason: "Match is not settled in match_state",
      };
    }

    const result = await scoreMatchPredictions(
      matchId,
      {
        homeScore: state.final_home_score,
        awayScore: state.final_away_score,
      },
      fixture,
    );

    return { matchId, status: "ok", result };
  } catch (error) {
    return {
      matchId,
      status: "error",
      error: error instanceof Error ? error.message : "Rescore failed",
    };
  }
}

export async function rescoreMatches(matchIds: number[]): Promise<RescoreMatchResult[]> {
  const results: RescoreMatchResult[] = [];
  for (const matchId of matchIds) {
    results.push(await rescoreMatch(matchId));
  }
  return results;
}

/** Knockout fixtures that may have been scored with TxLINE-only odds keys. */
export const KNOCKOUT_MATCH_IDS = [73, 74, 75, 76, 77, 78, 79, 80, 81] as const;
