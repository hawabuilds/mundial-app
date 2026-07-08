/**
 * Backfill solana_claims from confirmed devnet claim tx signatures.
 *
 * Usage:
 *   npx tsx scripts/backfill-solana-claims.ts <sig1> [sig2 ...]
 *   npx tsx scripts/backfill-solana-claims.ts --epoch 20260701 --user-id <x_id> --handle @name <sig>
 *
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY, Solana devnet RPC, program id.
 * Does not fabricate data — only parses real confirmed claim transactions.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { recordSolanaClaim } from "../app/lib/supabase";
import { fetchConfirmedClaimTx } from "../lib/solanaClaimRecord";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import { Connection } from "@solana/web3.js";

function parseArgs(argv: string[]) {
  let epochId: bigint | null = null;
  let userId: string | null = null;
  let userHandle: string | null = null;
  const signatures: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--epoch") {
      const raw = argv[++i];
      epochId = raw ? BigInt(raw) : null;
      continue;
    }
    if (arg === "--user-id") {
      userId = argv[++i] ?? null;
      continue;
    }
    if (arg === "--handle") {
      userHandle = argv[++i] ?? null;
      continue;
    }
    if (arg.length >= 80) signatures.push(arg);
  }

  return { epochId, userId, userHandle, signatures };
}

async function main() {
  const { epochId: epochOverride, userId, userHandle, signatures } =
    parseArgs(process.argv.slice(2));

  if (signatures.length === 0) {
    console.error(
      "Usage: npx tsx scripts/backfill-solana-claims.ts [--epoch ID] [--user-id ID] [--handle @name] <txSignature> [...]",
    );
    process.exit(1);
  }

  const config = readSolanaPayoutConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");

  for (const sig of signatures) {
    const parsed = await fetchConfirmedClaimTx(
      connection,
      sig,
      config.programId,
    );
    const epochId = epochOverride ?? parsed.epochId;

    let resolvedUserId = userId;
    let resolvedHandle = userHandle;
    if (!resolvedUserId || !resolvedHandle) {
      throw new Error(
        `Missing user for ${sig} — pass --user-id and --handle for the claimer`,
      );
    }

    const { inserted } = await recordSolanaClaim({
      epoch_id: Number(epochId),
      user_id: resolvedUserId,
      user_handle: resolvedHandle,
      recipient_token_account: parsed.recipientTokenAccount,
      amount_base_units: Number(parsed.amountBaseUnits),
      tx_signature: sig,
      confirmed_at:
        parsed.blockTime?.toISOString() ?? new Date().toISOString(),
    });

    console.log(
      JSON.stringify({
        tx_signature: sig,
        epoch_id: epochId.toString(),
        amount_base_units: parsed.amountBaseUnits.toString(),
        inserted,
      }),
    );
  }
}

void main();
