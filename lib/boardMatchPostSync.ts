import type { Fixture } from "@/app/data/fixtures";
import {
  findFixtureByTeamsAndKickoff,
  fixtureCacheKey,
  fixtureDateTime,
} from "@/app/data/fixtures";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import { isFriendlyCompetition } from "@/lib/matchStage";
import { fetchFixturesSnapshot, type TxFixture } from "@/lib/txodds";

function boardFixtureFromTx(fx: TxFixture): Fixture | null {
  if (isFriendlyCompetition(fx.Competition ?? "")) return null;

  const home = fx.Participant1IsHome ? fx.Participant1 : fx.Participant2;
  const away = fx.Participant1IsHome ? fx.Participant2 : fx.Participant1;
  if (!home || !away) return null;

  const kickoffUtcMs = normalizeStartTimeMs(fx.StartTime);
  const registry = findFixtureByTeamsAndKickoff(home, away, kickoffUtcMs);
  const iso = new Date(kickoffUtcMs).toISOString();

  return {
    id: registry?.id ?? fx.FixtureId,
    home,
    away,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    group: registry?.group ?? (fx.Competition ?? ""),
    externalFixtureId: registry?.externalFixtureId ?? fx.FixtureId,
  };
}

/** TxLINE fixtures in the match-post sync window (knockouts not in static registry). */
export async function getTxlineFixturesForMatchPostSync(
  now: Date = new Date(),
): Promise<Fixture[]> {
  const snap = await fetchFixturesSnapshot();
  const nowMs = now.getTime();
  const byKey = new Map<string, Fixture>();

  for (const fx of snap) {
    const fixture = boardFixtureFromTx(fx);
    if (!fixture) continue;

    const kickoff = fixtureDateTime(fixture).getTime();
    const hoursUntil = (kickoff - nowMs) / 3_600_000;
    if (hoursUntil < -2 || hoursUntil > 168) continue;

    byKey.set(fixtureCacheKey(fixture), fixture);
  }

  return [...byKey.values()];
}
