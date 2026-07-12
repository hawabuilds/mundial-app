import { getSupabaseAdminClient } from "@/app/lib/supabase";

const TABLE = "discord_leaderboard_posts";

function isMissingTableError(message: string): boolean {
  return (
    message.includes("does not exist") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache")
  );
}

function isDuplicateError(message: string, code?: string): boolean {
  return code === "23505" || /duplicate key/i.test(message);
}

/** Returns true when this epoch_id was newly claimed for posting. */
export async function claimDiscordLeaderboardPost(
  epochId: bigint,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);

  const { error } = await supabase.from(TABLE).insert({
    epoch_id: epochNumeric,
  });

  if (!error) return true;

  if (isDuplicateError(error.message, error.code)) {
    return false;
  }

  if (isMissingTableError(error.message)) {
    console.warn(
      `[discord-leaderboard] ${TABLE} table missing — idempotency disabled until migration runs`,
    );
    return true;
  }

  throw new Error(error.message);
}

/** Releases a claim so a failed webhook post can be retried. */
export async function releaseDiscordLeaderboardPostClaim(
  epochId: bigint,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const epochNumeric = Number(epochId);

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("epoch_id", epochNumeric);

  if (error && !isMissingTableError(error.message)) {
    console.warn(
      `[discord-leaderboard] could not release claim for epoch ${epochNumeric}: ${error.message}`,
    );
  }
}
