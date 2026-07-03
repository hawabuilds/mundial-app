// Live match board sourced directly from the TxLINE schedule (not the static
// fixtures list). Shows whatever TxLINE currently covers — upcoming, in-play,
// and just-finished matches — so the Fixtures tab always reflects real games.

import type { Fixture } from "@/app/data/fixtures";
import {
  fetchMatchWithGoals,
  isFinishedStatus,
  mapMatchRow,
  type LiveMatchData,
  type MatchGoal,
} from "./apiFootball";
import {
  BOARD_API_MAX_CALLS,
  MATCH_ASSUMED_DURATION_MIN,
  type BoardFixture,
  type FixturePhase,
} from "./enrichFixtures";
import { getMatchGoals, saveMatchGoals } from "@/app/lib/supabase";
import { venueLineForMatch } from "@/app/mundial/lib/venues";
import { fetchFixturesSnapshot, isTxoddsConfigured, type TxFixture } from "./txodds";

/** Board fixture carrying a display venue/competition line + live goals. */
export type ScheduleBoardFixture = BoardFixture & {
  venueLine: string;
  goals: MatchGoal[];
};

/** Only look up live scores for matches that kicked off within this window. */
const LIVE_LOOKUP_MAX_HOURS_AFTER_KICKOFF = 4;

function txStartToDateTime(startMs: number): { date: string; time: string } {
  const iso = new Date(startMs).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * Persist freshly-seen goals and return the accumulated set for the fixture.
 * Best-effort — if Supabase is not configured, the current snapshot goals are
 * returned unchanged.
 */
async function accumulateGoals(
  fixtureId: number,
  freshGoals: MatchGoal[],
): Promise<MatchGoal[]> {
  try {
    if (freshGoals.length > 0) await saveMatchGoals(fixtureId, freshGoals);
    const stored = await getMatchGoals(fixtureId);
    return stored.length > 0 ? stored : freshGoals;
  } catch {
    return freshGoals;
  }
}

function txToFixture(fx: TxFixture): Fixture {
  const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
  const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
  const { date, time } = txStartToDateTime(fx.StartTime);
  return {
    id: fx.FixtureId,
    home,
    away,
    date,
    time,
    group: fx.Competition ?? "",
  };
}

export async function getTxScheduleBoard(
  now: Date = new Date(),
): Promise<ScheduleBoardFixture[]> {
  if (!isTxoddsConfigured()) return [];

  const txFixtures = await fetchFixturesSnapshot();
  const sorted = [...txFixtures].sort((a, b) => a.StartTime - b.StartTime);

  const kickoffs = Array.from(new Set(sorted.map((f) => f.StartTime))).sort(
    (a, b) => a - b,
  );
  const nextKickoffAfter = (ms: number): number => {
    for (const k of kickoffs) if (k > ms) return k;
    return Number.POSITIVE_INFINITY;
  };

  const nowMs = now.getTime();
  const board: ScheduleBoardFixture[] = [];
  let liveLookups = 0;

  for (const fx of sorted) {
    const fixture = txToFixture(fx);
    const kickoffMs = fx.StartTime;
    // TxLINE has no venue field; reuse the real WC schedule's venue when the
    // teams match (blank for TxLINE-only demo fixtures).
    const venueLine = venueLineForMatch(fixture.home, fixture.away, fixture.date);
    const base = { ...fixture, apiConfigured: true, venueLine, goals: [] as MatchGoal[] };

    if (kickoffMs > nowMs) {
      board.push({ ...base, live: null, phase: "upcoming" });
      continue;
    }

    // Fetch a fresh live score (+ goals) for recently-started matches (bounded budget).
    let live: LiveMatchData | null = null;
    let goals: MatchGoal[] = [];
    const hoursSince = (nowMs - kickoffMs) / 3_600_000;
    if (
      hoursSince <= LIVE_LOOKUP_MAX_HOURS_AFTER_KICKOFF &&
      liveLookups < BOARD_API_MAX_CALLS
    ) {
      liveLookups += 1;
      try {
        const { match, goals: matchGoals } = await fetchMatchWithGoals(fixture);
        live = match ? mapMatchRow(match) : null;
        goals = matchGoals;
      } catch {
        live = null;
      }
    }

    const assumedFinished =
      nowMs - kickoffMs >= MATCH_ASSUMED_DURATION_MIN * 60_000;
    const finished = (live ? isFinishedStatus(live.status) : false) || assumedFinished;

    // Devnet feeds can stay stuck "in play" long after a match ends. Once we
    // consider it finished, present it as FT so the card shows a final result.
    const displayLive: LiveMatchData | null =
      finished && live && !isFinishedStatus(live.status)
        ? { ...live, status: "FT", elapsed: null }
        : live;

    // The snapshot only exposes the latest goal, so accumulate what we see across
    // polls. Falls back to snapshot-only goals if Supabase is unavailable.
    const mergedGoals = await accumulateGoals(fx.FixtureId, goals);

    if (!finished) {
      board.push({ ...base, live: displayLive, goals: mergedGoals, phase: "live" });
      continue;
    }

    // Finished: keep the result up until the next match kicks off.
    if (nowMs < nextKickoffAfter(kickoffMs)) {
      board.push({ ...base, live: displayLive, goals: mergedGoals, phase: "recent" });
    }
  }

  const phaseRank: Record<FixturePhase, number> = {
    live: 0,
    recent: 1,
    upcoming: 2,
  };
  board.sort((a, b) => {
    const byPhase = phaseRank[a.phase] - phaseRank[b.phase];
    if (byPhase !== 0) return byPhase;
    const aMs = new Date(`${a.date}T${a.time}:00Z`).getTime();
    const bMs = new Date(`${b.date}T${b.time}:00Z`).getTime();
    return aMs - bMs;
  });

  return board;
}
