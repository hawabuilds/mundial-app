import type { Fixture } from "@/app/data/fixtures";
import { findFixtureByTeamsAndKickoff } from "@/app/data/fixtures";
import {
  fetchScoresSnapshot,
  latestScoreEvent,
  type TxFixture,
} from "./txodds";

/**
 * Fixture IDs that fell off `/fixtures/snapshot` but still update under
 * `/scores/snapshot/{id}`. Metadata is hydrated from the scores feed only.
 */
export const PINNED_FIXTURE_IDS: number[] = [18175918];

export function pinnedFixtureIds(): Set<number> {
  return new Set(PINNED_FIXTURE_IDS);
}

function pinnedToBoardRow(input: {
  fixtureId: number;
  home: string;
  away: string;
  startTimeMs: number;
  competition?: string;
  fixtureGroupId?: number;
}): {
  fx: TxFixture;
  fixture: Fixture;
  kickoffMs: number;
  kickoffUtcMs: number;
} {
  const kickoffUtcMs = input.startTimeMs;
  const iso = new Date(kickoffUtcMs).toISOString();
  const fx: TxFixture = {
    Ts: 0,
    StartTime: kickoffUtcMs,
    Competition: input.competition ?? "World Cup",
    CompetitionId: 0,
    FixtureGroupId: input.fixtureGroupId ?? 0,
    Participant1Id: 0,
    Participant1: input.home,
    Participant2Id: 0,
    Participant2: input.away,
    FixtureId: input.fixtureId,
    Participant1IsHome: true,
  };
  const fixture: Fixture = {
    id:
      findFixtureByTeamsAndKickoff(
        input.home,
        input.away,
        kickoffUtcMs,
      )?.id ?? input.fixtureId,
    home: input.home,
    away: input.away,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: input.competition ?? "World Cup",
    externalFixtureId: input.fixtureId,
  };
  return { fx, fixture, kickoffMs: kickoffUtcMs, kickoffUtcMs };
}

/** Build a board row from TxLINE scores when the fixtures snapshot omits a match. */
export async function hydratePinnedRowFromScores(
  fixtureId: number,
): Promise<ReturnType<typeof pinnedToBoardRow> | null> {
  const events = await fetchScoresSnapshot(fixtureId);
  if (events.length === 0) return null;

  const anchor = latestScoreEvent(events) ?? events[events.length - 1]!;
  const withMeta = anchor as {
    StartTime?: number;
    FixtureGroupId?: number;
    Competition?: string;
    Participant1IsHome?: boolean;
  };

  const startTime =
    withMeta.StartTime ??
    (
      events.find((e) => (e as { StartTime?: number }).StartTime) as
        | { StartTime?: number }
        | undefined
    )?.StartTime;
  if (startTime == null) return null;

  const lineupsEv = events.find((e) => e.Lineups?.length);
  const teamNames =
    lineupsEv?.Lineups?.map((t) => t.preferredName?.trim()).filter(Boolean) ??
    [];
  const p1Home = withMeta.Participant1IsHome !== false;
  const p1Name = teamNames[0] ?? "Home";
  const p2Name = teamNames[1] ?? "Away";

  return pinnedToBoardRow({
    fixtureId,
    home: p1Home ? p1Name : p2Name,
    away: p1Home ? p2Name : p1Name,
    startTimeMs: startTime,
    competition: withMeta.Competition ?? "World Cup",
    fixtureGroupId: withMeta.FixtureGroupId,
  });
}
