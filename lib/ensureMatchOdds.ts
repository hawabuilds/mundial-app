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

async function readLockedOdds(fixtureId: number): Promise<Match1x2Odds | null> {
  try {
    const existing = await getMatchOdds(fixtureId);
    if (!existing) return null;
    return {
      homePct: existing.homePct,
      drawPct: existing.drawPct,
      awayPct: existing.awayPct,
    };
  } catch {
    return null;
  }
}

async function fetchTxLineOdds(
  fixtureId: number,
  lookup?: { home: string; away: string; kickoffMs: number },
): Promise<Match1x2Odds | null> {
  if (!isTxoddsConfigured()) return null;

  let txFixtureId = fixtureId;
  if (lookup) {
    const resolved = await resolveTxFixture(
      lookup.home,
      lookup.away,
      lookup.kickoffMs,
    );
    if (resolved) txFixtureId = resolved.FixtureId;
  }

  const rows = await fetchOddsSnapshot(txFixtureId);
  return parse1x2FullTime(rows);
}

/** Lock pre-kickoff 1X2 odds for a fixture (first snapshot wins). */
export async function ensureMatchOddsLocked(
  fixtureId: number,
  lookup?: { home: string; away: string; kickoffMs: number },
): Promise<Match1x2Odds | null> {
  const locked = await readLockedOdds(fixtureId);
  if (locked) return locked;

  try {
    const parsed = await fetchTxLineOdds(fixtureId, lookup);
    if (!parsed) return null;

    // Best-effort persist — display must work even if match_odds table is missing.
    try {
      await saveMatchOdds(fixtureId, parsed);
    } catch {
      /* Supabase not migrated yet */
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function ensureMatchOddsForFixture(
  fixture: Pick<Fixture, "id" | "home" | "away" | "date" | "time">,
): Promise<Match1x2Odds | null> {
  return ensureMatchOddsLocked(fixture.id, {
    home: fixture.home,
    away: fixture.away,
    kickoffMs: fixtureDateTime(fixture).getTime(),
  });
}

/** Load locked odds for scoring (falls back to on-demand lock). */
export async function getOddsForScoring(
  fixture: Pick<Fixture, "id" | "home" | "away" | "date" | "time">,
): Promise<Match1x2Odds | null> {
  return ensureMatchOddsForFixture(fixture);
}
