import { config } from "dotenv";
config({ path: ".env.local" });

import { Connection, Keypair } from "@solana/web3.js";
import { getSupabaseAdminClient } from "../app/lib/supabase";
import { hasFinalizedEpochForUtcDay } from "../app/lib/payoutEpochs";
import { parseSolanaSecretKey } from "../lib/solanaKeypair";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import {
  diagnoseSolanaOperatorEnv,
  readSolanaConfig,
  readSolanaVaultBalance,
} from "../lib/solanaOpenEpoch";
import { diagnoseSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import { diagnoseSolanaSignerEnv } from "../lib/solanaPayoutVoucher";
import { formatUsdcFromBaseUnits } from "../lib/formatUsdc";

async function main() {
  const now = new Date();
  const checks: { ok: boolean; label: string; detail?: string }[] = [];

  checks.push({
    ok: !diagnoseSolanaPayoutConfig(),
    label: "Solana payout env",
    detail: diagnoseSolanaPayoutConfig() ?? "program + USDC mint set",
  });
  checks.push({
    ok: !diagnoseSolanaOperatorEnv(),
    label: "Operator key",
    detail: diagnoseSolanaOperatorEnv() ?? "valid",
  });
  checks.push({
    ok: !diagnoseSolanaSignerEnv(),
    label: "Signer key",
    detail: diagnoseSolanaSignerEnv() ?? "valid",
  });

  try {
    const supabase = getSupabaseAdminClient();
    const { count, error } = await supabase
      .from("leaderboard_snapshots")
      .select("epoch_id", { count: "exact", head: true });
    checks.push({
      ok: !error,
      label: "Supabase service role",
      detail: error?.message ?? `${count ?? 0} snapshot rows total`,
    });
  } catch (error) {
    checks.push({
      ok: false,
      label: "Supabase service role",
      detail: error instanceof Error ? error.message : "failed",
    });
  }

  try {
    const alreadyToday = await hasFinalizedEpochForUtcDay(now);
    checks.push({
      ok: !alreadyToday,
      label: "No snapshot finalized today (UTC)",
      detail: alreadyToday
        ? "Today's UTC day already has a finalized epoch — Collect test needs a fresh snapshot or wait until tomorrow"
        : "clear to snapshot",
    });
  } catch (error) {
    checks.push({
      ok: false,
      label: "Today's snapshot check",
      detail: error instanceof Error ? error.message : "query failed",
    });
  }

  try {
    const cfg = readSolanaPayoutConfig();
    const connection = new Connection(cfg.rpcUrl, "confirmed");
    const onChain = await readSolanaConfig(connection, cfg.programId);
    const vault = await readSolanaVaultBalance(connection, cfg.programId);
    const opSecret = parseSolanaSecretKey(
      process.env.SOLANA_OPERATOR_SECRET_KEY?.trim(),
    );
    const opPub = opSecret
      ? Keypair.fromSecretKey(opSecret).publicKey.toBase58()
      : null;

    checks.push({
      ok: !!onChain,
      label: "On-chain config",
      detail: onChain
        ? `latest epoch ${onChain.latestEpoch.toString()}`
        : "not found",
    });

    if (onChain && opPub) {
      checks.push({
        ok: onChain.operator.toBase58() === opPub,
        label: "Operator matches on-chain",
        detail: `on-chain ${onChain.operator.toBase58()}`,
      });
    }

    if (vault !== null && onChain) {
      const free = vault > onChain.totalReserved ? vault - onChain.totalReserved : 0n;
      checks.push({
        ok: free > 0n,
        label: "Vault has free USDC",
        detail: `${formatUsdcFromBaseUnits(free)} free (${formatUsdcFromBaseUnits(vault)} total, ${formatUsdcFromBaseUnits(onChain.totalReserved)} reserved)`,
      });
    }
  } catch (error) {
    checks.push({
      ok: false,
      label: "Solana RPC / on-chain read",
      detail: error instanceof Error ? error.message : "failed",
    });
  }

  console.log("\n=== Copa Mundial devnet test readiness ===\n");
  for (const check of checks) {
    console.log(`${check.ok ? "✓" : "✗"} ${check.label}`);
    if (check.detail) console.log(`  ${check.detail}`);
  }

  const ready = checks.every((c) => c.ok);
  console.log(
    ready
      ? "\nReady to test after you run a snapshot and appear in top 20."
      : "\nFix the ✗ items above before testing Collect.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
