import type { Fixture } from "@/app/data/fixtures";
import { fixtureDateTime } from "@/app/data/fixtures";
import { getMatchOdds, saveMatchOdds } from "@/app/lib/supabase";
import type { Match1x2Odds } from "@/lib/scoring";
import {
  fetchOddsSnapshot,
  isTxoddsConfigured,
  parse1x2FullTime,
  resolveTxFixture,
} from "@/lib/txodds";

export type MatchOddsFixtureRef = Pick<
  Fixture,
  "id" | "home" | "away" | "date" | "time" | "externalFixtureId"
>;

function toMatch1x2Odds(stored: {
  homePct: number;
  drawPct: number;
  awayPct: number;
}): Match1x2Odds {
  return {
    homePct: stored.homePct,
    drawPct: stored.drawPct,
    awayPct: stored.awayPct,
  };
}

async function readLockedOdds(fixtureId: number): Promise<Match1x2Odds | null> {
  try {
    const existing = await getMatchOdds(fixtureId);
    if (!existing) return null;
    return toMatch1x2Odds(existing);
  } catch {
    return null;
  }
}

/**
 * Read locked odds by registry match id, falling back to legacy TxLINE-only rows.
 * When found under TxLINE id only, copy to the registry id so scoring stays stable.
 */
export async function resolveLockedMatchOdds(
  fixture: Pick<Fixture, "id" | "externalFixtureId">,
): Promise<Match1x2Odds | null> {
  const fromRegistry = await readLockedOdds(fixture.id);
  if (fromRegistry) return fromRegistry;

  const txFixtureId = fixture.externalFixtureId;
  if (txFixtureId == null || txFixtureId === fixture.id) return null;

  const fromTx = await readLockedOdds(txFixtureId);
  if (!fromTx) return null;

  try {
    await saveMatchOdds(fixture.id, fromTx);
  } catch {
    /* Supabase optional — still return odds for this score pass */
  }

  return fromTx;
}

async function fetchTxLineOdds(
  lookup: { home: string; away: string; kickoffMs: number },
  txFixtureIdHint?: number,
): Promise<Match1x2Odds | null> {
  if (!isTxoddsConfigured()) return null;

  let txFixtureId = txFixtureIdHint;
  if (txFixtureId == null) {
    const resolved = await resolveTxFixture(
      lookup.home,
      lookup.away,
      lookup.kickoffMs,
    );
    txFixtureId = resolved?.FixtureId;
  }
  if (txFixtureId == null) return null;

  const rows = await fetchOddsSnapshot(txFixtureId);
  return parse1x2FullTime(rows);
}

/**
 * Lock pre-kickoff 1X2 odds for a fixture.
 * Always persists under {@link storageFixtureId} (registry match id).
 */
export async function ensureMatchOddsLocked(
  storageFixtureId: number,
  lookup: { home: string; away: string; kickoffMs: number },
  txFixtureIdHint?: number,
): Promise<Match1x2Odds | null> {
  const locked = await readLockedOdds(storageFixtureId);
  if (locked) return locked;

  try {
    const parsed = await fetchTxLineOdds(lookup, txFixtureIdHint);
    if (!parsed) return null;

    try {
      await saveMatchOdds(storageFixtureId, parsed);
    } catch {
      /* Supabase not migrated yet */
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function ensureMatchOddsForFixture(
  fixture: MatchOddsFixtureRef,
): Promise<Match1x2Odds | null> {
  const locked = await resolveLockedMatchOdds(fixture);
  if (locked) return locked;

  return ensureMatchOddsLocked(
    fixture.id,
    {
      home: fixture.home,
      away: fixture.away,
      kickoffMs: fixtureDateTime(fixture).getTime(),
    },
    fixture.externalFixtureId,
  );
}

/** Load locked odds for scoring — alias-aware, with on-demand lock fallback. */
export async function getOddsForScoring(
  fixture: MatchOddsFixtureRef,
): Promise<Match1x2Odds | null> {
  return ensureMatchOddsForFixture(fixture);
}
