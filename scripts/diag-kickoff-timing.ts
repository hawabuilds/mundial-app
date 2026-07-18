import { config } from "dotenv";
config({ path: ".env.local" });

import { runDuePredictionCollection } from "@/lib/runDueCollection";
import {
  autoScoreFinishedMatches,
  getFixturesPendingAutoScoreFromSlate,
} from "@/lib/scoreFinishedMatches";
import { syncLiveMatchGoals } from "@/lib/syncLiveMatchGoals";
import { syncNewFixturesFromTxline } from "@/lib/syncNewFixturesFromTxline";
import {
  registryGap,
  syncFixtureRegistryToSupabase,
} from "@/lib/syncFixtureRegistry";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  console.log(`START ${label}`);
  try {
    const result = await fn();
    console.log(`DONE  ${label} ${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    console.error(`FAIL  ${label} ${Date.now() - t0}ms`, err);
    throw err;
  }
}

async function main(): Promise<void> {
  const tAll = Date.now();
  const registry = await timed("syncFixtureRegistry", () =>
    syncFixtureRegistryToSupabase(),
  );
  console.log("registry gap", registryGap(registry).length);

  const pendingScore = await timed("pendingScore", () =>
    getFixturesPendingAutoScoreFromSlate(),
  );
  console.log(
    "pendingScore count",
    pendingScore.length,
    pendingScore.map((f) => f.id).slice(0, 30),
  );

  const scoreResults = await timed("autoScore", () =>
    autoScoreFinishedMatches(pendingScore),
  );
  console.log(
    "score summary",
    scoreResults.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
  );

  const liveGoals = await timed("liveGoals", () => syncLiveMatchGoals());
  console.log("liveGoals", liveGoals);

  const txlineRegistry = await timed("txlineSync", () =>
    syncNewFixturesFromTxline(),
  );
  console.log("txline", {
    inserted: txlineRegistry.inserted.length,
    updated: txlineRegistry.updated.length,
    awaiting: txlineRegistry.awaitingTweet.length,
  });

  const collection = await timed("collection", () =>
    runDuePredictionCollection(),
  );
  console.log("collection", JSON.stringify(collection, null, 2));
  console.log("TOTAL_MS", Date.now() - tAll);
}

void main();
