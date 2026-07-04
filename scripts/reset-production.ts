import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });

import { FIXTURES } from "../app/data/fixtures";
import {
  getSupabaseAdminClient,
  getLeaderboard,
} from "../app/lib/supabase";
import { syncFixtureRegistryToSupabase } from "../lib/syncFixtureRegistry";

const VALID_MATCH_IDS = new Set(FIXTURES.map((fixture) => fixture.id));

async function clearPredictions(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("predictions")
    .delete()
    .neq("user_id", "")
    .select("user_id");

  if (error) throw new Error(`predictions: ${error.message}`);
  return data?.length ?? 0;
}

async function clearLeaderboardSnapshots(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .delete()
    .gte("epoch_id", 0)
    .select("epoch_id");

  if (error) throw new Error(`leaderboard_snapshots: ${error.message}`);
  return data?.length ?? 0;
}

async function clearPayoutEpochs(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payout_epochs")
    .delete()
    .gte("epoch_id", 0)
    .select("epoch_id");

  if (error) throw new Error(`payout_epochs: ${error.message}`);
  return data?.length ?? 0;
}

async function clearUserWallets(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_wallets")
    .delete()
    .neq("user_id", "")
    .select("user_id");

  if (error) throw new Error(`user_wallets: ${error.message}`);
  return data?.length ?? 0;
}

function isMissingTableError(message: string): boolean {
  return (
    message.includes("does not exist") ||
    message.includes("Could not find the table")
  );
}

async function clearMatchGoals(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_goals")
    .delete()
    .gte("match_id", 0)
    .select("match_id");

  if (error && isMissingTableError(error.message)) return 0;
  if (error) throw new Error(`match_goals: ${error.message}`);
  return data?.length ?? 0;
}

async function clearMatchProofs(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_proofs")
    .delete()
    .gte("fixture_id", 0)
    .select("fixture_id");

  if (error && isMissingTableError(error.message)) return 0;
  if (error) throw new Error(`match_proofs: ${error.message}`);
  return data?.length ?? 0;
}

async function clearMatchOdds(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_odds")
    .delete()
    .gte("match_id", 0)
    .select("match_id");

  if (error && isMissingTableError(error.message)) return 0;
  if (error) throw new Error(`match_odds: ${error.message}`);
  return data?.length ?? 0;
}

async function removeTestMatchState(): Promise<{
  deleted: number;
  reset: number;
}> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("match_state")
    .select("match_id");

  if (fetchError) throw new Error(`match_state: ${fetchError.message}`);
  if (!existing?.length) return { deleted: 0, reset: 0 };

  let deleted = 0;
  let reset = 0;

  for (const row of existing) {
    if (!VALID_MATCH_IDS.has(row.match_id)) {
      const { error: deleteError } = await supabase
        .from("match_state")
        .delete()
        .eq("match_id", row.match_id);

      if (deleteError) {
        throw new Error(`match_state delete ${row.match_id}: ${deleteError.message}`);
      }
      deleted += 1;
      continue;
    }

    const { error: resetError } = await supabase
      .from("match_state")
      .update({
        predictions_collected_at: null,
        scored_at: null,
        final_home_score: null,
        final_away_score: null,
        match_tweet_id: null,
        match_fixture_key: null,
      })
      .eq("match_id", row.match_id);

    if (resetError) {
      throw new Error(`match_state reset ${row.match_id}: ${resetError.message}`);
    }
    reset += 1;
  }

  return { deleted, reset };
}

async function main() {
  console.log("Production reset — clearing test data\n");
  console.log("Valid match ids:", [...VALID_MATCH_IDS].sort((a, b) => a - b).join(", "));
  console.log("Leaderboard before:", await getLeaderboard());

  const predictionsDeleted = await clearPredictions();
  const snapshotsDeleted = await clearLeaderboardSnapshots();
  const epochsDeleted = await clearPayoutEpochs();
  const walletsDeleted = await clearUserWallets();
  const matchGoalsDeleted = await clearMatchGoals();
  const matchProofsDeleted = await clearMatchProofs();
  const matchOddsDeleted = await clearMatchOdds();
  const matchState = await removeTestMatchState();

  console.log(`\nCleared ${predictionsDeleted} prediction row(s).`);
  console.log(`Cleared ${snapshotsDeleted} leaderboard_snapshot row(s).`);
  console.log(`Cleared ${epochsDeleted} payout_epoch row(s).`);
  console.log(`Cleared ${walletsDeleted} user_wallet row(s).`);
  console.log(`Cleared ${matchGoalsDeleted} match_goals row(s).`);
  console.log(`Cleared ${matchProofsDeleted} match_proof row(s).`);
  console.log(`Cleared ${matchOddsDeleted} match_odds row(s).`);
  console.log(
    `Removed ${matchState.deleted} test match_state row(s); reset ${matchState.reset} World Cup row(s).`,
  );

  const sync = await syncFixtureRegistryToSupabase(FIXTURES);
  console.log("\nFixture registry sync:", JSON.stringify(sync, null, 2));
  console.log("\nLeaderboard after:", await getLeaderboard());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
