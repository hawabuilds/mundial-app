import { isGameStateInPlay } from "./apiFootball";
import { matchGoalsFromEvents, persistTxlineGoals } from "./matchGoalsPersist";
import {
  fetchFixturesSnapshot,
  fetchScoresSnapshot,
  isTxoddsConfigured,
  type TxFixture,
} from "./txodds";

export type SyncLiveGoalsResult = {
  checked: number;
  persisted: number;
  errors: string[];
};

function homeIsParticipant1(fx: TxFixture | undefined): boolean {
  return fx?.Participant1IsHome !== false;
}

/**
 * Poll in-play TxLINE fixtures and accumulate play-by-play goals so full-time
 * display keeps scorers/minutes after the feed trims historical goal rows.
 */
export async function syncLiveMatchGoals(): Promise<SyncLiveGoalsResult> {
  const result: SyncLiveGoalsResult = { checked: 0, persisted: 0, errors: [] };
  if (!isTxoddsConfigured()) return result;

  const fixtures = await fetchFixturesSnapshot();
  const fixtureById = new Map(fixtures.map((fx) => [fx.FixtureId, fx]));
  const inPlayIds = fixtures
    .filter((fx) => isGameStateInPlay(fx.GameState))
    .map((fx) => fx.FixtureId);

  for (const fixtureId of inPlayIds) {
    result.checked += 1;
    try {
      const events = await fetchScoresSnapshot(fixtureId);
      if (events.length === 0) continue;

      const goals = matchGoalsFromEvents(
        events,
        homeIsParticipant1(fixtureById.get(fixtureId)),
        "persist",
      );
      if (goals.length === 0) continue;
      await persistTxlineGoals(fixtureId, goals);
      result.persisted += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "sync live goals failed";
      result.errors.push(`${fixtureId}: ${message}`);
    }
  }

  return result;
}
