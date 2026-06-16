import { getSupabaseAdminClient } from "@/app/lib/supabase";

export type UserWalletRow = {
  id: string;
  created_at: string;
  user_id: string;
  wallet_address: string;
  updated_at: string;
};

export async function upsertUserWallet(
  userId: string,
  walletAddress: string,
): Promise<UserWalletRow> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_wallets")
    .upsert(
      {
        user_id: userId,
        wallet_address: walletAddress,
        updated_at: now,
      },
      { onConflict: "user_id" },
    )
    .select("id, created_at, user_id, wallet_address, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserWalletRow;
}

export async function getUserWallet(
  userId: string,
): Promise<UserWalletRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("user_wallets")
    .select("id, created_at, user_id, wallet_address, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserWalletRow | null) ?? null;
}
