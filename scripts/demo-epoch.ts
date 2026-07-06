import { config } from "dotenv";
config({ path: ".env.local" });

import { Connection } from "@solana/web3.js";
import {
  insertLeaderboardSnapshot,
} from "../app/lib/leaderboardSnapshots";
import {
  getPayoutEpoch,
  markPayoutEpochFinalized,
  parsePotWei,
  upsertPayoutEpochPot,
} from "../app/lib/payoutEpochs";
import { getLeaderboard } from "../app/lib/supabase";
import { parseEpochId } from "../lib/epochId";
import { formatUsdcFromBaseUnits, parseUsdcToBaseUnits } from "../lib/formatUsdc";
import { isTopTwentyRank } from "../lib/payoutTiers";
import { potUsdCentsFromUsdcBaseUnits } from "../lib/formatUsdc";
import {
  getAvailableSolanaEpochPot,
  resolveSolanaEpochPotAmount,
} from "../lib/solanaPayoutEpoch";
import {
  resolveSolanaOpenEpochId,
  useSequentialSolanaEpochIds,
} from "../lib/solanaEpochId";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import {
  diagnoseSolanaOperatorEnv,
  openSolanaEpoch,
  readSolanaEpoch,
} from "../lib/solanaOpenEpoch";
import { snapshotEpochLeaderboard } from "../lib/snapshotEpoch";

function assertDevnetRpc(): void {
  const rpc = process.env.SOLANA_RPC_URL?.trim() ?? "";
  if (!rpc.includes("devnet")) {
    console.error(
      'Refusing to run demo:epoch — SOLANA_RPC_URL must contain "devnet"',
    );
    process.exit(1);
  }
}

function parseArgs(): { pot?: string; epochId?: string } {
  const out: { pot?: string; epochId?: string } = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pot" && argv[i + 1]) {
      out.pot = argv[++i];
      continue;
    }
    if (arg === "--epoch-id" && argv[i + 1]) {
      out.epochId = argv[++i];
      continue;
    }
  }
  return out;
}

function parsePotUsdc(raw: string): bigint {
  return parseUsdcToBaseUnits(raw);
}

async function openDemoEpoch(epochId: bigint, pot: bigint) {
  const payoutConfig = readSolanaPayoutConfig();
  const connection = new Connection(payoutConfig.rpcUrl, "confirmed");

  const onChain = await readSolanaEpoch(
    connection,
    payoutConfig.programId,
    epochId,
  );
  const epochAlreadyOpen = Boolean(onChain?.open && onChain.pot > 0n);
  const effectivePot = epochAlreadyOpen ? onChain!.pot : pot;

  if (!epochAlreadyOpen) {
    const available = await getAvailableSolanaEpochPot(
      connection,
      payoutConfig.programId,
    );
    if (available && pot > available.availablePot) {
      console.error(
        `Pot ${formatUsdcFromBaseUnits(pot)} exceeds free vault USDC ${formatUsdcFromBaseUnits(available.availablePot)}`,
      );
      process.exit(1);
    }
  } else {
    console.log(
      `Epoch ${epochId.toString()} already open on-chain with ${formatUsdcFromBaseUnits(effectivePot)} USDC — syncing DB`,
    );
  }

  console.log(
    `Opening demo epoch ${epochId.toString()} with pot ${formatUsdcFromBaseUnits(effectivePot)} USDC (${effectivePot.toString()} base units)…`,
  );

  await upsertPayoutEpochPot(epochId, effectivePot);
  const openResult = await openSolanaEpoch({
    epochId,
    pot: effectivePot,
    connection,
  });
  console.log(
    JSON.stringify(
      openResult,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );

  if (openResult.status === "error") {
    process.exit(1);
  }

  return { epochId, pot: effectivePot };
}

async function finalizeSnapshot(epochId: bigint) {
  const epoch = await getPayoutEpoch(epochId);
  if (epoch?.finalized_at) {
    console.log(
      JSON.stringify({
        status: "already_finalized",
        epochId: epochId.toString(),
        finalizedAt: epoch.finalized_at,
      }),
    );
    return;
  }

  const potWei = parsePotWei(epoch?.pot_wei);
  if (!potWei) {
    console.error(`Epoch ${epochId.toString()} has no pot — open it first`);
    process.exit(1);
  }

  const topTwenty = (await getLeaderboard(20)).filter((entry) =>
    isTopTwentyRank(entry.rank),
  );
  if (topTwenty.length === 0) {
    console.error("No scored players on leaderboard yet");
    process.exit(1);
  }

  const rows = await insertLeaderboardSnapshot(epochId, topTwenty);
  const potUsdCents = potUsdCentsFromUsdcBaseUnits(potWei);
  await markPayoutEpochFinalized(epochId, potUsdCents);

  console.log(
    JSON.stringify(
      {
        status: "created",
        epochId: epochId.toString(),
        rows,
        potWei: potWei.toString(),
        potUsdCents,
        payoutRail: "solana",
      },
      null,
      2,
    ),
  );
}

async function main() {
  assertDevnetRpc();

  const { pot: potArg, epochId: epochIdArg } = parseArgs();
  if (!potArg) {
    console.error(
      "Usage: npm run demo:epoch -- --pot <USDC> [--epoch-id <id>]",
    );
    process.exit(1);
  }

  const operatorError = diagnoseSolanaOperatorEnv();
  if (operatorError) {
    console.error(operatorError);
    process.exit(1);
  }

  const pot = parsePotUsdc(potArg);
  if (pot <= 0n) {
    console.error("--pot must be greater than zero");
    process.exit(1);
  }

  if (epochIdArg) {
    const requested = parseEpochId(epochIdArg);
    if (requested === null) {
      console.error("--epoch-id must be a positive integer");
      process.exit(1);
    }
    await openDemoEpoch(requested, pot);
    await finalizeSnapshot(requested);
    return;
  }

  process.env.SOLANA_DAILY_POT_USDC = potArg;

  const snapAt = new Date();
  snapAt.setUTCDate(snapAt.getUTCDate() + 1);
  snapAt.setUTCHours(12, 0, 0, 0);

  if (useSequentialSolanaEpochIds()) {
    const payoutConfig = readSolanaPayoutConfig();
    const connection = new Connection(payoutConfig.rpcUrl, "confirmed");
    const nextEpoch = await resolveSolanaOpenEpochId({
      connection,
      programId: payoutConfig.programId,
    });
    if (nextEpoch !== null) {
      console.log(
        `Devnet sequential epoch mode: next epoch will be ${nextEpoch.toString()}`,
      );
    }
  }

  const available = await getAvailableSolanaEpochPot(
    new Connection(readSolanaPayoutConfig().rpcUrl, "confirmed"),
    readSolanaPayoutConfig().programId,
  );
  if (available) {
    const check = resolveSolanaEpochPotAmount(available.availablePot);
    if (!check.ok && !readSolanaDailyPotOverride(potArg)) {
      console.error(check.reason);
      process.exit(1);
    }
    if (pot > available.availablePot) {
      console.error(
        `Pot ${formatUsdcFromBaseUnits(pot)} exceeds free vault USDC ${formatUsdcFromBaseUnits(available.availablePot)}`,
      );
      process.exit(1);
    }
  }

  const result = await snapshotEpochLeaderboard(snapAt);
  console.log(
    JSON.stringify(
      result,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );

  if (result.status !== "created") {
    process.exit(1);
  }
}

function readSolanaDailyPotOverride(potArg: string): boolean {
  return potArg.trim().length > 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
