import type { Fixture } from "@/app/data/fixtures";
import { fixtureCacheKey } from "@/app/data/fixtures";
import { normalizeStartTimeMs } from "@/lib/formatKickoff";
import { isWorldCupCompetition } from "@/lib/matchStage";
import type { TxFixture } from "@/lib/txodds";

export type TxlineRegistryRow = {
  matchId: number;
  txFixtureId: number;
  homeTeam: string | null;
  awayTeam: string | null;
  kickoffAt: string | null;
  competition: string | null;
  predictionsCollectedAt: string | null;
  scoredAt: string | null;
  predictionCount: number;
};

export type TxlineFixtureDraft = {
  txFixtureId: number;
  matchId: number;
  home: string;
  away: string;
  date: string;
  time: string;
  kickoffAt: string;
  competition: string;
  group: string;
  fixtureKey: string;
};

export type TxlineFixtureDiff = {
  toInsert: TxlineFixtureDraft[];
  toUpdate: Array<{
    draft: TxlineFixtureDraft;
    matchId: number;
    changes: string[];
  }>;
  skipped: Array<{ txFixtureId: number; reason: string }>;
};

function kickoffParts(startTime: number): { date: string; time: string; kickoffAt: string } {
  const kickoffUtcMs = normalizeStartTimeMs(startTime);
  const iso = new Date(kickoffUtcMs).toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    kickoffAt: iso,
  };
}

/** Map a TxLINE snapshot row onto Mundial fixture fields (World Cup only). */
export function txFixtureToDraft(tx: TxFixture): TxlineFixtureDraft | null {
  const competition = tx.Competition ?? "";
  if (!isWorldCupCompetition(competition)) return null;

  const home = tx.Participant1IsHome ? tx.Participant1 : tx.Participant2;
  const away = tx.Participant1IsHome ? tx.Participant2 : tx.Participant1;
  const { date, time, kickoffAt } = kickoffParts(tx.StartTime ?? 0);
  if (!home || !away || !date || !time) return null;

  const group = competition.trim() || "FIFA World Cup";
  return {
    txFixtureId: tx.FixtureId,
    matchId: tx.FixtureId,
    home,
    away,
    date,
    time,
    kickoffAt,
    competition: group,
    group,
    fixtureKey: fixtureCacheKey({ home, away, date }),
  };
}

/** Known TxLINE FixtureIds from static slate + stored registry rows. */
export function knownTxFixtureIds(
  staticFixtures: Fixture[],
  registryRows: TxlineRegistryRow[],
): Set<number> {
  const ids = new Set<number>();
  for (const fixture of staticFixtures) {
    if (fixture.externalFixtureId != null && fixture.externalFixtureId > 0) {
      ids.add(fixture.externalFixtureId);
    }
  }
  for (const row of registryRows) {
    if (row.txFixtureId > 0) ids.add(row.txFixtureId);
  }
  return ids;
}

export function registryRowByTxFixtureId(
  registryRows: TxlineRegistryRow[],
): Map<number, TxlineRegistryRow> {
  const map = new Map<number, TxlineRegistryRow>();
  for (const row of registryRows) {
    if (row.txFixtureId > 0) map.set(row.txFixtureId, row);
  }
  return map;
}

export function staticFixtureByTxId(
  staticFixtures: Fixture[],
): Map<number, Fixture> {
  const map = new Map<number, Fixture>();
  for (const fixture of staticFixtures) {
    if (fixture.externalFixtureId != null && fixture.externalFixtureId > 0) {
      map.set(fixture.externalFixtureId, fixture);
    }
  }
  return map;
}

function registryRowIsProtected(row: TxlineRegistryRow): boolean {
  return (
    Boolean(row.predictionsCollectedAt) ||
    Boolean(row.scoredAt) ||
    row.predictionCount > 0
  );
}

function fieldChanges(
  draft: TxlineFixtureDraft,
  row: TxlineRegistryRow,
): string[] {
  const changes: string[] = [];
  if ((row.homeTeam ?? "").trim() !== draft.home) changes.push("home_team");
  if ((row.awayTeam ?? "").trim() !== draft.away) changes.push("away_team");
  if ((row.kickoffAt ?? "").trim() !== draft.kickoffAt) changes.push("kickoff_at");
  if ((row.competition ?? "").trim() !== draft.competition) changes.push("competition");
  return changes;
}

/**
 * Pure diff: snapshot World Cup fixtures vs registry.
 * Inserts are fixtures whose FixtureId is not yet known.
 */
export function diffTxlineFixtures(
  snapshot: TxFixture[],
  staticFixtures: Fixture[],
  registryRows: TxlineRegistryRow[],
): TxlineFixtureDiff {
  const known = knownTxFixtureIds(staticFixtures, registryRows);
  const byTxId = registryRowByTxFixtureId(registryRows);
  const staticByTxId = staticFixtureByTxId(staticFixtures);

  const toInsert: TxlineFixtureDraft[] = [];
  const toUpdate: TxlineFixtureDiff["toUpdate"] = [];
  const skipped: TxlineFixtureDiff["skipped"] = [];

  for (const tx of snapshot) {
    const draft = txFixtureToDraft(tx);
    if (!draft) continue;

    if (!known.has(draft.txFixtureId)) {
      toInsert.push(draft);
      continue;
    }

    const staticFixture = staticByTxId.get(draft.txFixtureId);
    if (staticFixture) {
      const row = byTxId.get(draft.txFixtureId);
      if (!row) continue;
      const changes = fieldChanges(draft, row);
      if (changes.length === 0) continue;
      if (registryRowIsProtected(row)) {
        skipped.push({
          txFixtureId: draft.txFixtureId,
          reason: `Static fixture ${staticFixture.id} has collection/scoring history — logged only (${changes.join(", ")})`,
        });
        continue;
      }
      toUpdate.push({ draft, matchId: staticFixture.id, changes });
      continue;
    }

    const row = byTxId.get(draft.txFixtureId);
    if (!row) continue;
    const changes = fieldChanges(draft, row);
    if (changes.length === 0) continue;
    if (registryRowIsProtected(row)) {
      skipped.push({
        txFixtureId: draft.txFixtureId,
        reason: `Match ${row.matchId} has predictions or is settled — refusing update (${changes.join(", ")})`,
      });
      continue;
    }
    toUpdate.push({ draft, matchId: row.matchId, changes });
  }

  return { toInsert, toUpdate, skipped };
}

/** Convert a stored auto-registry row into a Fixture for collection/scheduling. */
export function fixtureFromRegistryDraft(draft: TxlineFixtureDraft): Fixture {
  return {
    id: draft.matchId,
    home: draft.home,
    away: draft.away,
    date: draft.date,
    time: draft.time,
    group: draft.group,
    externalFixtureId: draft.txFixtureId,
    autoSettleFromApi: true,
  };
}
