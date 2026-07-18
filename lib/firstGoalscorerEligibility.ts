import {
  findFixtureByTeamsAndKickoff,
  getFixtureById,
  type Fixture,
} from "@/app/data/fixtures";
import { getMatchState, type MatchStateRow } from "@/app/lib/supabase";
import {
  getScorePredictionForUser,
  listUpcomingFirstGoalscorerOpportunities,
  type ScorePredictionRow,
} from "@/app/lib/firstGoalscorerPredictions";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import {
  resolveFixtureKickoffMs,
} from "@/lib/firstGoalscorerPredictionLock";
import { isFriendlyCompetition } from "@/lib/matchStage";
import {
  buildEligiblePreKickoffPredictions,
  type EligiblePrediction,
} from "@/lib/predictionEligibility";
import { fetchReplies } from "@/lib/fetchReplies";
import {
  UI_MATCH_POST_OPTIONS,
  resolveMatchTweetId,
} from "@/lib/resolveMatchTweet";
import {
  fetchFixturesSnapshot,
  isTxoddsConfigured,
  type TxFixture,
} from "@/lib/txodds";

export type ScorePredictionSource = "db" | "x";

export type ResolvedScorePrediction = {
  source: ScorePredictionSource;
  home: number;
  away: number;
  user_handle: string;
  replied_at?: string;
};

const eligibilityCache = new Map<
  string,
  { expiresAt: number; prediction: ResolvedScorePrediction | null }
>();
const ELIGIBILITY_CACHE_MS = 45_000;

function cacheKey(userId: string, matchId: number): string {
  return `${userId}:${matchId}`;
}

function readEligibilityCache(
  userId: string,
  matchId: number,
): ResolvedScorePrediction | null | undefined {
  const hit = eligibilityCache.get(cacheKey(userId, matchId));
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    eligibilityCache.delete(cacheKey(userId, matchId));
    return undefined;
  }
  return hit.prediction;
}

function writeEligibilityCache(
  userId: string,
  matchId: number,
  prediction: ResolvedScorePrediction | null,
): void {
  eligibilityCache.set(cacheKey(userId, matchId), {
    expiresAt: Date.now() + ELIGIBILITY_CACHE_MS,
    prediction,
  });
}

function fixtureFromMatchState(state: MatchStateRow): Fixture | null {
  const home = state.home_team?.trim();
  const away = state.away_team?.trim();
  if (!home || !away) return null;

  const kickoffAt = state.kickoff_at ? Date.parse(state.kickoff_at) : Number.NaN;
  if (!Number.isFinite(kickoffAt)) return null;

  const iso = new Date(kickoffAt).toISOString();
  const registry = findFixtureByTeamsAndKickoff(home, away, kickoffAt);
  return {
    id: state.match_id,
    home,
    away,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: state.competition ?? registry?.group ?? "World Cup",
    externalFixtureId: state.tx_fixture_id ?? registry?.externalFixtureId ?? state.match_id,
  };
}

function fixtureFromTxRow(fx: TxFixture): Fixture | null {
  const competition = fx.Competition ?? "";
  if (isFriendlyCompetition(competition)) return null;

  const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
  const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
  const kickoffUtcMs = normalizeStartTimeMs(fx.StartTime);
  const iso = new Date(kickoffUtcMs).toISOString();
  const registry = findFixtureByTeamsAndKickoff(home, away, kickoffUtcMs);

  return {
    id: registry?.id ?? fx.FixtureId,
    home,
    away,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: registry?.group ?? competition,
    externalFixtureId: registry?.externalFixtureId ?? fx.FixtureId,
  };
}

/** Static registry, match_state, or TxLINE schedule — board matches included. */
export async function resolveFixtureForFirstGoalscorer(
  matchId: number,
): Promise<Fixture | null> {
  const fromRegistry = getFixtureById(matchId);
  if (fromRegistry) return fromRegistry;

  const state = await getMatchState(matchId).catch(() => null);
  if (state) {
    const fromState = fixtureFromMatchState(state);
    if (fromState) return fromState;
  }

  if (!isTxoddsConfigured()) return null;

  const txFixtures = await fetchFixturesSnapshot().catch(() => []);
  const txRow =
    txFixtures.find((row) => row.FixtureId === matchId) ??
    (state?.tx_fixture_id
      ? txFixtures.find((row) => row.FixtureId === state.tx_fixture_id)
      : undefined);

  if (!txRow) return null;
  return fixtureFromTxRow(txRow);
}

function toResolvedFromDb(row: ScorePredictionRow): ResolvedScorePrediction {
  return {
    source: "db",
    home: row.home_score,
    away: row.away_score,
    user_handle: row.user_handle,
  };
}

function toResolvedFromX(row: EligiblePrediction): ResolvedScorePrediction {
  return {
    source: "x",
    home: row.homeScore,
    away: row.awayScore,
    user_handle: row.userHandle,
    replied_at: row.repliedAt,
  };
}

async function loadXScorePredictionForUser(
  userId: string,
  fixture: Fixture,
  kickoffMs: number,
): Promise<ResolvedScorePrediction | null> {
  if (Date.now() >= kickoffMs) return null;

  const tweetId = await resolveMatchTweetId(fixture, UI_MATCH_POST_OPTIONS);
  if (!tweetId) return null;

  const replies = await fetchReplies(tweetId, { maxPages: 2 });
  const eligible = buildEligiblePreKickoffPredictions(
    replies,
    fixture,
    kickoffMs,
  );
  const hit = eligible.get(userId);
  return hit ? toResolvedFromX(hit) : null;
}

/**
 * Scoreline eligibility for first-goalscorer picks.
 * DB row wins; before kickoff we also accept a valid pre-kickoff X reply.
 */
export async function resolveScorePredictionForFirstGoalscorer(input: {
  userId: string;
  matchId: number;
  fixture: Fixture;
}): Promise<ResolvedScorePrediction | null> {
  const cached = readEligibilityCache(input.userId, input.matchId);
  if (cached !== undefined) return cached;

  const fromDb = await getScorePredictionForUser(input.userId, input.matchId);
  if (fromDb) {
    const resolved = toResolvedFromDb(fromDb);
    writeEligibilityCache(input.userId, input.matchId, resolved);
    return resolved;
  }

  const kickoffMs = await resolveFixtureKickoffMs(input.matchId, input.fixture);
  let fromX: ResolvedScorePrediction | null = null;
  try {
    fromX = await loadXScorePredictionForUser(
      input.userId,
      input.fixture,
      kickoffMs,
    );
  } catch {
    fromX = null;
  }

  writeEligibilityCache(input.userId, input.matchId, fromX);
  return fromX;
}

export async function listFirstGoalscorerOpportunities(
  userId: string,
  matchIds: number[],
): Promise<
  Array<{
    match_id: number;
    hasScorePrediction: boolean;
    hasFirstGoalscorerPrediction: boolean;
    scoreSource: ScorePredictionSource | null;
  }>
> {
  const base = await listUpcomingFirstGoalscorerOpportunities(userId, matchIds);

  return Promise.all(
    base.map(async (op) => {
      if (op.hasScorePrediction) {
        return { ...op, scoreSource: "db" as const };
      }

      const fixture = await resolveFixtureForFirstGoalscorer(op.match_id);
      if (!fixture) {
        return { ...op, scoreSource: null };
      }

      const kickoffMs = await resolveFixtureKickoffMs(op.match_id, fixture);
      if (Date.now() >= kickoffMs) {
        return { ...op, scoreSource: null };
      }

      const resolved = await resolveScorePredictionForFirstGoalscorer({
        userId,
        matchId: op.match_id,
        fixture,
      });

      return {
        ...op,
        hasScorePrediction: Boolean(resolved),
        scoreSource: resolved?.source ?? null,
      };
    }),
  );
}

export function clearFirstGoalscorerEligibilityCache(
  userId: string,
  matchId: number,
): void {
  eligibilityCache.delete(cacheKey(userId, matchId));
}
