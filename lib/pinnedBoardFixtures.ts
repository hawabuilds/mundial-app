import type { Fixture } from "@/app/data/fixtures";
import { findFixtureByTeamsAndKickoff, fixtureDateTime } from "@/app/data/fixtures";
import { WORLD_CUP_2026_FIXTURES } from "@/app/data/worldCup2026Fixtures";
import { isPinnedBoardKickoffWindow } from "./boardDisplayPolicy";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import { isFriendlyCompetition } from "@/lib/matchStage";
import {
  fetchScoresSnapshot,
  latestScoreEvent,
  latestTerminalStatusId,
  type TxFixture,
  type TxScoreEvent,
} from "./txodds";

function gameStateFromScoreEvent(event: TxScoreEvent | null): number | undefined {
  if (event?.StatusId != null) return event.StatusId;
  return undefined;
}

function pinnedToBoardRow(input: {
  fixtureId: number;
  home: string;
  away: string;
  startTimeMs: number;
  competition?: string;
  fixtureGroupId?: number;
  gameState?: number;
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
    GameState: input.gameState,
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

export type PinnedBoardRow = ReturnType<typeof pinnedToBoardRow>;

function registryPinnedTxFixtureIds(nowMs: number): number[] {
  return WORLD_CUP_2026_FIXTURES.filter((fixture) => fixture.externalFixtureId != null)
    .filter((fixture) => {
      const kickoffMs = fixtureDateTime(fixture).getTime();
      return isPinnedBoardKickoffWindow(kickoffMs, nowMs);
    })
    .map((fixture) => fixture.externalFixtureId!);
}

/** Every TxLINE World Cup fixture in the board window (QF+ included). */
export function pinnedTxFixtureIdsFromSnapshot(
  txFixtures: readonly TxFixture[],
  nowMs: number,
): number[] {
  const ids: number[] = [];
  for (const fx of txFixtures) {
    const competition = fx.Competition ?? "";
    if (isFriendlyCompetition(competition)) continue;
    const kickoffMs = normalizeStartTimeMs(fx.StartTime);
    if (!isPinnedBoardKickoffWindow(kickoffMs, nowMs)) continue;
    ids.push(fx.FixtureId);
  }
  return ids;
}

/**
 * All tournament matches in the board window — static registry plus every
 * World Cup row on the TxLINE schedule (quarter-finals and beyond).
 */
export function pinnedTxFixtureIdsInBoardWindow(
  nowMs: number,
  txFixtures?: readonly TxFixture[],
): number[] {
  const ids = new Set<number>(registryPinnedTxFixtureIds(nowMs));
  if (txFixtures?.length) {
    for (const fixtureId of pinnedTxFixtureIdsFromSnapshot(txFixtures, nowMs)) {
      ids.add(fixtureId);
    }
  }
  return [...ids];
}

export function pinnedFixtureIds(
  nowMs = Date.now(),
  txFixtures?: readonly TxFixture[],
): Set<number> {
  return new Set(pinnedTxFixtureIdsInBoardWindow(nowMs, txFixtures));
}

function hydratePinnedRowFromScoreEvents(
  fixtureId: number,
  events: TxScoreEvent[],
): PinnedBoardRow | null {
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
  const p1Name = teamNames[0]?.trim();
  const p2Name = teamNames[1]?.trim();
  // Scores without lineups are not enough to build a board row — callers must
  // keep the TxLINE fixtures snapshot names instead of inventing Home/Away.
  if (!p1Name || !p2Name) return null;

  return pinnedToBoardRow({
    fixtureId,
    home: p1Home ? p1Name : p2Name,
    away: p1Home ? p2Name : p1Name,
    startTimeMs: startTime,
    competition: withMeta.Competition ?? "World Cup",
    fixtureGroupId: withMeta.FixtureGroupId,
    gameState: latestTerminalStatusId(events) ?? gameStateFromScoreEvent(anchor),
  });
}

/** Build a board row from TxLINE scores when the fixtures snapshot omits a match. */
export async function hydratePinnedRowFromScores(
  fixtureId: number,
): Promise<PinnedBoardRow | null> {
  const events = await fetchScoresSnapshot(fixtureId);
  return hydratePinnedRowFromScoreEvents(fixtureId, events);
}
