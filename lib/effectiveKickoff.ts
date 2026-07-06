import { fixtureDateTime, type Fixture } from "@/app/data/fixtures";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import { teamNamesMatch, type TxFixture } from "@/lib/txodds";

/** How long after the scheduled slot we still wait for a delayed TxLINE StartTime. */
export const MAX_KICKOFF_DELAY_HOURS = 3;

/**
 * Effective kickoff for predictions/collection — prefers TxLINE StartTime when
 * the feed moves a delayed match (e.g. +1 hour).
 */
export function resolveKickoffMs(
  fixture: Fixture,
  txStartTimeMs?: number | null,
): number {
  const txMs = txStartTimeMs != null ? normalizeStartTimeMs(txStartTimeMs) : 0;
  if (txMs > 0) return txMs;
  return fixtureDateTime(fixture).getTime();
}

export function buildTxStartTimeByFixtureId(
  txFixtures: TxFixture[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const fx of txFixtures) {
    map.set(fx.FixtureId, normalizeStartTimeMs(fx.StartTime));
  }
  return map;
}

export function resolveTxStartTimeForFixture(
  fixture: Fixture,
  startByTxId: Map<number, number>,
  txFixtures: TxFixture[],
): number | null {
  if (fixture.externalFixtureId) {
    const direct = startByTxId.get(fixture.externalFixtureId);
    if (direct != null) return direct;
  }

  const scheduledMs = fixtureDateTime(fixture).getTime();
  for (const fx of txFixtures) {
    const startMs = normalizeStartTimeMs(fx.StartTime);
    if (Math.abs(startMs - scheduledMs) > MAX_KICKOFF_DELAY_HOURS * 3_600_000) {
      continue;
    }
    const homeIsP1 = fx.Participant1IsHome !== false;
    const txHome = homeIsP1 ? fx.Participant1 : fx.Participant2;
    const txAway = homeIsP1 ? fx.Participant2 : fx.Participant1;
    if (teamNamesMatch(txHome, fixture.home) && teamNamesMatch(txAway, fixture.away)) {
      return startMs;
    }
  }

  return null;
}
