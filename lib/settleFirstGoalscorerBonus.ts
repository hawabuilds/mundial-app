import { getFixtureById, type Fixture } from "@/app/data/fixtures";
import { listFirstGoalscorerPredictionsForMatch } from "@/app/lib/firstGoalscorerPredictions";
import {
  getMatchGoals,
  getMatchState,
  getSupabaseAdminClient,
  isMatchScored,
} from "@/app/lib/supabase";
import {
  planFirstGoalscorerSettlement,
  type FirstGoalscorerSettlementSummary,
} from "@/lib/firstGoalscorerScoring";

export async function clearFirstGoalscorerBonusSettlement(
  matchId: number,
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error: stateError } = await supabase
    .from("match_state")
    .update({ first_goalscorer_settled_at: null })
    .eq("match_id", matchId);

  if (stateError && !stateError.message.includes("first_goalscorer_settled_at")) {
    throw new Error(stateError.message);
  }

  const { error: bonusError } = await supabase
    .from("predictions")
    .update({ first_goalscorer_bonus: null })
    .eq("match_id", matchId);

  if (bonusError && !bonusError.message.includes("first_goalscorer_bonus")) {
    throw new Error(bonusError.message);
  }
}

export async function settleFirstGoalscorerBonusForMatch(
  matchId: number,
  fixtureOverride?: Pick<Fixture, "externalFixtureId">,
): Promise<FirstGoalscorerSettlementSummary> {
  const empty = (
    status: FirstGoalscorerSettlementSummary["status"],
    reason?: string,
  ): FirstGoalscorerSettlementSummary => ({
    matchId,
    status,
    reason,
    picksProcessed: 0,
    doubled: 0,
    noBonus: 0,
    voided: 0,
  });

  try {
    if (!(await isMatchScored(matchId).catch(() => false))) {
      return empty("skipped", "Match not scored yet");
    }

    const state = await getMatchState(matchId);
    if (
      state?.final_home_score == null ||
      state?.final_away_score == null
    ) {
      return empty("skipped", "Missing final score in match_state");
    }

    if (state.first_goalscorer_settled_at) {
      return empty("already_settled");
    }

    const fixture = fixtureOverride ?? getFixtureById(matchId);
    const txFixtureId = fixture?.externalFixtureId;
    if (txFixtureId == null || txFixtureId <= 0) {
      return empty("skipped", "No TxLINE fixture id");
    }

    const goals = await getMatchGoals(txFixtureId).catch(() => []);
    const picks = await listFirstGoalscorerPredictionsForMatch(matchId);
    if (picks.length === 0) {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from("match_state")
        .update({ first_goalscorer_settled_at: new Date().toISOString() })
        .eq("match_id", matchId);
      return empty("settled", "No first-goalscorer picks");
    }

    const supabase = getSupabaseAdminClient();
    const userIds = picks.map((pick) => pick.user_id);
    const { data: predictionRows, error: predictionError } = await supabase
      .from("predictions")
      .select("user_id, points, score_base, score_multiplier")
      .eq("match_id", matchId)
      .in("user_id", userIds);

    if (predictionError) throw new Error(predictionError.message);

    const predictionsByUserId = new Map(
      (predictionRows ?? []).map((row) => [
        row.user_id as string,
        {
          points: row.points as number | null,
          score_base: row.score_base as number | null | undefined,
          score_multiplier: row.score_multiplier as number | null | undefined,
        },
      ]),
    );

    const scoredAtMs = state.scored_at ? Date.parse(state.scored_at) : null;
    const plan = planFirstGoalscorerSettlement({
      goals,
      homeScore: state.final_home_score,
      awayScore: state.final_away_score,
      picks,
      predictionsByUserId,
      scoredAtMs,
    });

    if (plan.action === "wait") {
      return {
        matchId,
        status: "waiting",
        reason: plan.assessment.reasons.join("; ") || "Goal data incomplete",
        assessment: plan.assessment,
        picksProcessed: 0,
        doubled: 0,
        noBonus: 0,
        voided: 0,
      };
    }

    let doubled = 0;
    let noBonus = 0;
    let voided = 0;

    for (const pick of picks) {
      const decision = plan.decisions.get(pick.user_id);
      if (!decision) continue;

      const { error: updateError } = await supabase
        .from("predictions")
        .update({
          points: decision.finalPoints,
          first_goalscorer_bonus: decision.bonusPoints,
        })
        .eq("user_id", pick.user_id)
        .eq("match_id", matchId);

      if (
        updateError?.message.includes("first_goalscorer_bonus")
      ) {
        const { error: fallbackError } = await supabase
          .from("predictions")
          .update({ points: decision.finalPoints })
          .eq("user_id", pick.user_id)
          .eq("match_id", matchId);
        if (fallbackError) throw new Error(fallbackError.message);
      } else if (updateError) {
        throw new Error(updateError.message);
      }

      if (decision.outcome === "doubled") doubled += 1;
      else if (decision.outcome === "void") voided += 1;
      else noBonus += 1;
    }

    const { error: settledError } = await supabase
      .from("match_state")
      .update({ first_goalscorer_settled_at: new Date().toISOString() })
      .eq("match_id", matchId);

    if (
      settledError &&
      !settledError.message.includes("first_goalscorer_settled_at")
    ) {
      throw new Error(settledError.message);
    }

    const voidedAll =
      plan.assessment.settleableForFirstScorer === false &&
      voided === picks.length;

    return {
      matchId,
      status: voidedAll ? "settled_void" : "settled",
      assessment: plan.assessment,
      picksProcessed: picks.length,
      doubled,
      noBonus,
      voided,
    };
  } catch (error) {
    return {
      matchId,
      status: "error",
      reason: error instanceof Error ? error.message : "Settlement failed",
      picksProcessed: 0,
      doubled: 0,
      noBonus: 0,
      voided: 0,
    };
  }
}

export async function retryFirstGoalscorerBonusSettlement(
  fixtures: Array<Pick<Fixture, "id" | "externalFixtureId">>,
): Promise<FirstGoalscorerSettlementSummary[]> {
  const results: FirstGoalscorerSettlementSummary[] = [];
  for (const fixture of fixtures) {
    const result = await settleFirstGoalscorerBonusForMatch(fixture.id, fixture);
    if (
      result.status === "settled" ||
      result.status === "settled_void" ||
      result.status === "waiting"
    ) {
      results.push(result);
    }
  }
  return results;
}
