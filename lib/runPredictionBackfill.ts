import type { Fixture } from "@/app/data/fixtures";
import { fixtureCacheKey } from "@/app/data/fixtures";
import {
  getMatchState,
  isEffectivelyCollected,
  isMatchScored,
  markMatchCollected,
  saveMatchTweetId,
  scoreMatchPredictions,
} from "@/app/lib/supabase";
import { shouldMarkMatchCollected } from "@/lib/collectionComplete";
import { collectPredictionsForFixture } from "@/lib/collectPredictions";
import {
  buildTxStartTimeByFixtureId,
  resolveTxStartTimeForFixture,
} from "@/lib/effectiveKickoff";
import {
  bumpBackfillAttempt,
  ensurePredictionBackfillRows,
  targetForMatch,
  type PredictionBackfillRow,
} from "@/lib/predictionBackfillState";
import {
  PREDICTION_BACKFILL_MAX_AGE_MS,
  PREDICTION_BACKFILL_MAX_ATTEMPTS,
} from "@/lib/predictionBackfillTargets";
import { autoScoreFinishedMatches } from "@/lib/scoreFinishedMatches";
import { fetchFixturesSnapshot } from "@/lib/txodds";

export type BackfillMatchResult = {
  matchId: number;
  label: string;
  status:
    | "already_done"
    | "pending_x_down"
    | "pending_no_replies"
    | "collected_scored"
    | "abandoned"
    | "error";
  message: string;
  predictionsSaved?: number;
  repliesFetched?: number;
};

export type PredictionBackfillPassResult = {
  checkedAt: string;
  complete: boolean;
  message: string;
  matches: BackfillMatchResult[];
};

function matchLabel(row: PredictionBackfillRow): string {
  const home = row.home_team ?? targetForMatch(row.match_id)?.home ?? "?";
  const away = row.away_team ?? targetForMatch(row.match_id)?.away ?? "?";
  return `${home} vs ${away} (${row.match_id})`;
}

export function isXOutageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /service unavailable/i.test(message) ||
    /\b503\b/.test(message) ||
    /\b502\b/.test(message) ||
    /bad gateway/i.test(message) ||
    /too many requests/i.test(message) ||
    /\b429\b/.test(message) ||
    /ECONNRESET/i.test(message) ||
    /fetch failed/i.test(message) ||
    /network/i.test(message)
  );
}

function shouldAbandon(row: PredictionBackfillRow, nowMs: number): boolean {
  if (row.attempts >= PREDICTION_BACKFILL_MAX_ATTEMPTS) return true;
  const startedMs = Date.parse(row.started_at);
  if (!Number.isFinite(startedMs)) return false;
  return nowMs - startedMs >= PREDICTION_BACKFILL_MAX_AGE_MS;
}

async function loadFixture(matchId: number): Promise<Fixture | null> {
  const state = await getMatchState(matchId);
  const target = targetForMatch(matchId);
  if (!state?.kickoff_at && !target) return null;

  const kickoffAt = state?.kickoff_at
    ? String(state.kickoff_at)
    : `${target!.date}T12:00:00.000Z`;
  const iso = new Date(kickoffAt).toISOString();
  const home = String(state?.home_team ?? target?.home ?? "");
  const away = String(state?.away_team ?? target?.away ?? "");
  const tweetId =
    state?.match_tweet_id?.trim() || target?.tweetId || undefined;

  return {
    id: matchId,
    home,
    away,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: String(state?.competition ?? "FIFA World Cup"),
    externalFixtureId: Number(state?.tx_fixture_id ?? matchId),
    autoSettleFromApi: true,
    tweetId,
  };
}

async function scoreBackfilledMatch(
  fixture: Fixture,
): Promise<Record<string, unknown>> {
  if (await isMatchScored(fixture.id)) {
    const state = await getMatchState(fixture.id);
    if (
      state?.final_home_score == null ||
      state.final_away_score == null
    ) {
      return { status: "skipped", reason: "scored_at set but final score missing" };
    }
    const result = await scoreMatchPredictions(
      fixture.id,
      {
        homeScore: state.final_home_score,
        awayScore: state.final_away_score,
      },
      fixture,
    );
    return { status: "rescored", ...result };
  }

  const [auto] = await autoScoreFinishedMatches([fixture]);
  return (auto as Record<string, unknown>) ?? {
    status: "skipped",
    reason: "auto-score returned nothing",
  };
}

function scoreAttemptSucceeded(scoreResult: Record<string, unknown>): boolean {
  return scoreResult.status === "scored" || scoreResult.status === "rescored";
}

async function processPendingMatch(
  row: PredictionBackfillRow,
  nowMs: number,
): Promise<BackfillMatchResult> {
  const label = matchLabel(row);

  if (row.status === "done") {
    // Self-heal: collection marked done before scoring succeeded.
    if (
      (await isEffectivelyCollected(row.match_id)) &&
      !(await isMatchScored(row.match_id))
    ) {
      console.log(
        `match ${row.match_id}: collected but unscored — reopening backfill`,
      );
    } else {
      return {
        matchId: row.match_id,
        label,
        status: "already_done",
        message: `match ${row.match_id}: already done`,
      };
    }
  }

  if (row.status === "abandoned") {
    return {
      matchId: row.match_id,
      label,
      status: "abandoned",
      message: `match ${row.match_id}: abandoned earlier`,
    };
  }

  if (
    (await isEffectivelyCollected(row.match_id)) &&
    (await isMatchScored(row.match_id))
  ) {
    await bumpBackfillAttempt(row.match_id, {
      status: "done",
      completed: true,
      lastError: null,
      lastResult: { reason: "already collected and scored" },
    });
    console.log(
      `match ${row.match_id}: already collected+scored, marking done`,
    );
    return {
      matchId: row.match_id,
      label,
      status: "already_done",
      message: `match ${row.match_id}: already collected+scored, marking done`,
    };
  }

  // Collected but never scored (false backfill completion) — score only.
  if (
    (await isEffectivelyCollected(row.match_id)) &&
    !(await isMatchScored(row.match_id))
  ) {
    const fixture = await loadFixture(row.match_id);
    if (!fixture) {
      const message = `match ${row.match_id}: fixture not found in match_state`;
      console.log(message);
      await bumpBackfillAttempt(row.match_id, { lastError: message });
      return {
        matchId: row.match_id,
        label,
        status: "error",
        message,
      };
    }

    const scoreResult = await scoreBackfilledMatch(fixture);
    if (!scoreAttemptSucceeded(scoreResult)) {
      const reason =
        typeof scoreResult.reason === "string"
          ? scoreResult.reason
          : typeof scoreResult.status === "string"
            ? scoreResult.status
            : "scoring skipped";
      const message = `match ${row.match_id}: still pending scoring (${reason}) — will retry in 15min`;
      console.log(message);
      await bumpBackfillAttempt(row.match_id, {
        status: "pending",
        lastError: reason,
        lastResult: { score: scoreResult },
      });
      return {
        matchId: row.match_id,
        label,
        status: "pending_no_replies",
        message,
      };
    }

    const message = `match ${row.match_id}: X recovered, collected (existing) predictions, scored, leaderboard updated`;
    console.log(message);
    await bumpBackfillAttempt(row.match_id, {
      status: "done",
      completed: true,
      lastError: null,
      lastResult: { score: scoreResult },
    });
    return {
      matchId: row.match_id,
      label,
      status: "collected_scored",
      message,
    };
  }

  if (shouldAbandon(row, nowMs)) {
    const message = `match ${row.match_id}: backfill could not complete after ${row.attempts} attempts / 24h window — abandoning`;
    console.log(message);
    await bumpBackfillAttempt(row.match_id, {
      status: "abandoned",
      completed: true,
      lastError: message,
    });
    return {
      matchId: row.match_id,
      label,
      status: "abandoned",
      message,
    };
  }

  const fixture = await loadFixture(row.match_id);
  if (!fixture) {
    const message = `match ${row.match_id}: fixture not found in match_state`;
    console.log(message);
    await bumpBackfillAttempt(row.match_id, {
      lastError: message,
    });
    return {
      matchId: row.match_id,
      label,
      status: "error",
      message,
    };
  }

  const tweetId = row.tweet_id.trim() || fixture.tweetId?.trim();
  if (!tweetId) {
    const message = `match ${row.match_id}: missing tweet id`;
    console.log(message);
    await bumpBackfillAttempt(row.match_id, { lastError: message });
    return {
      matchId: row.match_id,
      label,
      status: "error",
      message,
    };
  }

  await saveMatchTweetId(
    fixture.id,
    tweetId,
    fixtureCacheKey(fixture),
  ).catch(() => undefined);

  try {
    const snapshot = await fetchFixturesSnapshot().catch(() => []);
    const startByTxId = buildTxStartTimeByFixtureId(snapshot);
    const effectiveKickoffMs =
      resolveTxStartTimeForFixture(fixture, startByTxId, snapshot) ??
      Date.parse(`${fixture.date}T${fixture.time}:00Z`);

    const collected = await collectPredictionsForFixture(
      fixture,
      tweetId,
      effectiveKickoffMs,
    );

    if (!shouldMarkMatchCollected(collected)) {
      const message = `match ${row.match_id}: still pending, X responded but 0 replies — will retry in 15min`;
      console.log(message);
      await bumpBackfillAttempt(row.match_id, {
        lastError: "0 replies",
        lastResult: collected as unknown as Record<string, unknown>,
      });
      return {
        matchId: row.match_id,
        label,
        status: "pending_no_replies",
        message,
        repliesFetched: collected.repliesFetched,
        predictionsSaved: collected.validPredictionsSaved,
      };
    }

    await markMatchCollected(fixture.id);
    const scoreResult = await scoreBackfilledMatch(fixture);

    if (!scoreAttemptSucceeded(scoreResult)) {
      const reason =
        typeof scoreResult.reason === "string"
          ? scoreResult.reason
          : typeof scoreResult.status === "string"
            ? scoreResult.status
            : "scoring skipped";
      const message = `match ${row.match_id}: collected ${collected.validPredictionsSaved} predictions, but scoring pending (${reason}) — will retry in 15min`;
      console.log(message);
      await bumpBackfillAttempt(row.match_id, {
        status: "pending",
        lastError: reason,
        lastResult: {
          collected,
          score: scoreResult,
        },
      });
      return {
        matchId: row.match_id,
        label,
        status: "pending_no_replies",
        message,
        repliesFetched: collected.repliesFetched,
        predictionsSaved: collected.validPredictionsSaved,
      };
    }

    const message = `match ${row.match_id}: X recovered, collected ${collected.validPredictionsSaved} predictions, scored, leaderboard updated`;
    console.log(message);
    await bumpBackfillAttempt(row.match_id, {
      status: "done",
      completed: true,
      lastError: null,
      lastResult: {
        collected,
        score: scoreResult,
      },
    });

    return {
      matchId: row.match_id,
      label,
      status: "collected_scored",
      message,
      repliesFetched: collected.repliesFetched,
      predictionsSaved: collected.validPredictionsSaved,
    };
  } catch (error) {
    if (isXOutageError(error)) {
      const message = `match ${row.match_id}: still pending, X down — will retry in 15min`;
      console.log(message);
      console.log("X still down, will retry in 15min");
      await bumpBackfillAttempt(row.match_id, {
        lastError: error instanceof Error ? error.message : String(error),
      });
      return {
        matchId: row.match_id,
        label,
        status: "pending_x_down",
        message,
      };
    }

    const message = `match ${row.match_id}: error — ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.log(message);
    await bumpBackfillAttempt(row.match_id, {
      lastError: error instanceof Error ? error.message : String(error),
    });
    return {
      matchId: row.match_id,
      label,
      status: "error",
      message,
    };
  }
}

/** One serverless cron tick — no in-process loops; next tick retries. */
export async function runPredictionBackfill(
  now: Date = new Date(),
): Promise<PredictionBackfillPassResult> {
  const rows = await ensurePredictionBackfillRows();

  const workRows: PredictionBackfillRow[] = [];
  for (const row of rows) {
    if (row.status === "pending") {
      workRows.push(row);
      continue;
    }
    // Self-heal false completions: collected predictions but never scored.
    if (
      row.status === "done" &&
      (await isEffectivelyCollected(row.match_id)) &&
      !(await isMatchScored(row.match_id))
    ) {
      workRows.push(row);
    }
  }

  if (workRows.length === 0) {
    const message = "backfill complete, disabling";
    console.log(message);
    return {
      checkedAt: now.toISOString(),
      complete: true,
      message,
      matches: rows.map((row) => ({
        matchId: row.match_id,
        label: matchLabel(row),
        status: row.status === "abandoned" ? "abandoned" : "already_done",
        message: `match ${row.match_id}: ${row.status}`,
      })),
    };
  }

  const matches: BackfillMatchResult[] = [];
  for (const row of workRows) {
    matches.push(await processPendingMatch(row, now.getTime()));
  }

  const refreshed = await ensurePredictionBackfillRows();
  const stillPending = [];
  for (const row of refreshed) {
    if (row.status === "pending") {
      stillPending.push(row);
      continue;
    }
    if (
      row.status === "done" &&
      (await isEffectivelyCollected(row.match_id)) &&
      !(await isMatchScored(row.match_id))
    ) {
      stillPending.push(row);
    }
  }
  const complete = stillPending.length === 0;
  const message = complete
    ? "backfill complete, disabling"
    : "X still down, will retry in 15min";

  if (complete) {
    console.log(message);
  } else if (matches.every((m) => m.status === "pending_x_down")) {
    console.log(message);
  }

  return {
    checkedAt: now.toISOString(),
    complete,
    message,
    matches,
  };
}
