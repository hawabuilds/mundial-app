/**
 * Discover confirmed devnet claim txs for the Mundial program and backfill
 * solana_claims (requires migration applied first).
 *
 *   npx tsx scripts/discover-and-backfill-claims.ts
 *   npx tsx scripts/discover-and-backfill-claims.ts --dry-run
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient, recordSolanaClaim } from "../app/lib/supabase";
import { fetchConfirmedClaimTx } from "../lib/solanaClaimRecord";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const config = readSolanaPayoutConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const supabase = getSupabaseAdminClient();

  const { data: wallets, error: walletErr } = await supabase
    .from("user_wallets")
    .select("user_id, wallet_address");
  if (walletErr) throw new Error(walletErr.message);

  const { data: snaps, error: snapErr } = await supabase
    .from("leaderboard_snapshots")
    .select("epoch_id, user_id, user_handle, rank");
  if (snapErr) throw new Error(snapErr.message);

  const signatures = await connection.getSignaturesForAddress(
    config.programId,
    { limit: 30 },
  );

  let inserted = 0;
  let skipped = 0;

  for (const row of signatures) {
    let parsed;
    try {
      parsed = await fetchConfirmedClaimTx(
        connection,
        row.signature,
        config.programId,
      );
    } catch {
      skipped += 1;
      continue;
    }

    const epochId = Number(parsed.epochId);
    const recipient = parsed.recipientTokenAccount;

    let userId: string | null = null;
    let userHandle: string | null = null;

    for (const wallet of wallets ?? []) {
      try {
        const ata = getAssociatedTokenAddressSync(
          config.usdcMint,
          new PublicKey(wallet.wallet_address),
        ).toBase58();
        if (ata === recipient) {
          userId = wallet.user_id;
          const snap = (snaps ?? []).find(
            (s) => s.epoch_id === epochId && s.user_id === wallet.user_id,
          );
          userHandle = snap?.user_handle ?? wallet.user_id;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!userId || !userHandle) {
      const rank1 = (snaps ?? []).find(
        (s) => s.epoch_id === epochId && s.rank === 1,
      );
      if (rank1) {
        userId = rank1.user_id;
        userHandle = rank1.user_handle;
        console.warn(
          `warn: ${row.signature.slice(0, 12)}… epoch ${epochId} — no ATA/wallet match; using rank 1 ${userHandle}`,
        );
      } else {
        console.warn(
          `skip: ${row.signature.slice(0, 12)}… epoch ${epochId} — no user match`,
        );
        skipped += 1;
        continue;
      }
    }

    if (dryRun) {
      console.log(
        JSON.stringify({
          dryRun: true,
          tx_signature: row.signature,
          epoch_id: epochId,
          user_handle: userHandle,
          amount_base_units: parsed.amountBaseUnits.toString(),
        }),
      );
      continue;
    }

    const { inserted: ok } = await recordSolanaClaim({
      epoch_id: epochId,
      user_id: userId,
      user_handle: userHandle,
      recipient_token_account: recipient,
      amount_base_units: Number(parsed.amountBaseUnits),
      tx_signature: row.signature,
      confirmed_at:
        parsed.blockTime?.toISOString() ?? new Date().toISOString(),
    });

    if (ok) inserted += 1;
    else skipped += 1;

    console.log(
      JSON.stringify({
        tx_signature: row.signature,
        epoch_id: epochId,
        user_handle: userHandle,
        inserted: ok,
      }),
    );
  }

  console.log(JSON.stringify({ inserted, skipped, scanned: signatures.length }));
}

void main();
