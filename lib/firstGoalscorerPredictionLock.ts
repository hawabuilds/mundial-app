import { getFixtureById, type Fixture } from "@/app/data/fixtures";
import { getMatchState } from "@/app/lib/supabase";
import { resolveKickoffMs } from "@/lib/effectiveKickoff";

export function isBeforeKickoff(
  fixture: Fixture,
  txStartTimeMs?: number | null,
  nowMs: number = Date.now(),
): boolean {
  return nowMs < resolveKickoffMs(fixture, txStartTimeMs);
}

export async function resolveFixtureKickoffMs(
  matchId: number,
  fixture: Fixture,
): Promise<number> {
  const state = await getMatchState(matchId).catch(() => null);
  const kickoffAt = state?.kickoff_at ? Date.parse(state.kickoff_at) : Number.NaN;
  if (Number.isFinite(kickoffAt)) return kickoffAt;
  return resolveKickoffMs(fixture, null);
}

export function assertBeforeKickoff(
  fixture: Fixture,
  kickoffMs: number,
  nowMs: number = Date.now(),
): void {
  if (nowMs >= kickoffMs) {
    throw new Error("First goalscorer picks lock at kickoff.");
  }
}

/** Static registry only — use resolveFixtureForFirstGoalscorer for board matches. */
export function getFixtureForMatch(matchId: number): Fixture | null {
  return getFixtureById(matchId) ?? null;
}
