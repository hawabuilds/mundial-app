import type { Fixture } from "@/app/data/fixtures";

const WORLD_CUP_GROUP = /world\s*cup|fifa\s*world\s*cup/i;

/** World Cup knockouts may run ~3h; keep API score polls through ET/PEN. */
export const WORLD_CUP_SCORE_POLL_EXTRA_MINUTES = 45;

/**
 * Whether the score-finished cron may settle via API-Football before X collection completes.
 * Requires externalFixtureId. Uses API fulltime (90+injury), not ET or pens.
 */
export function fixtureAutoSettlesFromApi(
  fixture: Pick<Fixture, "group" | "autoSettleFromApi" | "externalFixtureId">,
): boolean {
  if (!fixture.externalFixtureId) return false;
  if (fixture.autoSettleFromApi === false) return false;
  if (fixture.autoSettleFromApi === true) return true;
  return WORLD_CUP_GROUP.test(fixture.group);
}
