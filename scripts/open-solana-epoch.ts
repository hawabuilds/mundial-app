import { config } from "dotenv";
config({ path: ".env.local" });

import { Connection } from "@solana/web3.js";
import { getPayoutEpoch, parsePotWei } from "../app/lib/payoutEpochs";
import { parseEpochId } from "../lib/epochId";
import { formatUsdcFromBaseUnits, parseUsdcToBaseUnits } from "../lib/formatUsdc";
import {
  getAvailableSolanaEpochPot,
  readSolanaDailyPotUsdcBaseUnits,
  resolveSolanaEpochPotAmount,
} from "../lib/solanaPayoutEpoch";
import { ensureVaultUsdcForEpoch } from "../lib/solanaVaultFunding";
import {
  resolveSolanaOpenEpochId,
  useSequentialSolanaEpochIds,
} from "../lib/solanaEpochId";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";
import {
  diagnoseSolanaOperatorEnv,
  openSolanaEpoch,
} from "../lib/solanaOpenEpoch";

async function main() {
  const epochArg = process.argv[2];
  const potArg = process.argv[3];

  const operatorError = diagnoseSolanaOperatorEnv();
  if (operatorError) {
    console.error(operatorError);
    process.exit(1);
  }

  let payoutConfig;
  try {
    payoutConfig = readSolanaPayoutConfig();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Solana payout config missing",
    );
    process.exit(1);
  }

  const requestedEpoch = epochArg ? parseEpochId(epochArg) : null;
  if (epochArg && requestedEpoch === null) {
    console.error("epochId must be a positive integer, e.g. 1781469354 or 20260615");
    process.exit(1);
  }

  const connection = new Connection(payoutConfig.rpcUrl, "confirmed");
  const epochId = await resolveSolanaOpenEpochId({
    connection,
    programId: payoutConfig.programId,
    requested: requestedEpoch,
  });
  if (epochId === null) {
    console.error("Could not resolve epoch id — is the program initialized?");
    process.exit(1);
  }

  if (!epochArg && useSequentialSolanaEpochIds()) {
    console.warn(
      `Devnet sequential epoch mode: opening next on-chain epoch ${epochId.toString()} (not calendar YYYYMMDD)`,
    );
  }

  let pot: bigint;
  if (potArg) {
    if (/^\d+$/.test(potArg)) {
      pot = BigInt(potArg);
    } else {
      pot = parseUsdcToBaseUnits(potArg);
    }
  } else {
    const dailyPot = readSolanaDailyPotUsdcBaseUnits();
    if (dailyPot) {
      pot = dailyPot;
      console.log(
        `Using SOLANA_DAILY_POT_USDC → ${formatUsdcFromBaseUnits(pot)} USDC`,
      );
    } else {
      const row = await getPayoutEpoch(epochId);
      const potWei = row ? parsePotWei(row.pot_wei) : null;
      if (!potWei || potWei <= 0n) {
        console.error(
          "No pot for this epoch — pass pot as 2nd arg (e.g. 1500.00) or set SOLANA_DAILY_POT_USDC",
        );
        process.exit(1);
      }
      pot = potWei;
      console.log(
        `Using pot from DB payout_epochs → ${formatUsdcFromBaseUnits(pot)} USDC`,
      );
    }
  }

  let available = await getAvailableSolanaEpochPot(
    connection,
    payoutConfig.programId,
  );
  if (available && pot > available.availablePot) {
    const funded = await ensureVaultUsdcForEpoch({
      connection,
      programId: payoutConfig.programId,
      usdcMint: payoutConfig.usdcMint,
      requiredPot: pot,
      availablePot: available.availablePot,
    });
    if (!funded.ok) {
      console.error(funded.reason);
      process.exit(1);
    }
    if (funded.minted > 0n) {
      console.log(
        `Auto-minted ${formatUsdcFromBaseUnits(funded.minted)} USDC into vault (${funded.signature})`,
      );
      const refreshed = await getAvailableSolanaEpochPot(
        connection,
        payoutConfig.programId,
      );
      if (refreshed) available = refreshed;
    }
  }
  if (available) {
    const check = resolveSolanaEpochPotAmount(available.availablePot);
    if (!check.ok || pot > available.availablePot) {
      console.error(
        check.ok
          ? `Pot ${formatUsdcFromBaseUnits(pot)} exceeds free vault USDC ${formatUsdcFromBaseUnits(available.availablePot)}`
          : check.reason,
      );
      process.exit(1);
    }
  }

  console.log(
    `Opening Solana epoch ${epochId.toString()} with pot ${formatUsdcFromBaseUnits(pot)} USDC (${pot.toString()} base units)…`,
  );

  const result = await openSolanaEpoch({ epochId, pot });
  console.log(JSON.stringify(result, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));

  if (result.status === "error") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
