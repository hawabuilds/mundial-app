import {
  getPayoutEpoch,
  parsePotWei,
  setPayoutEpochPotWei,
  upsertPayoutEpochPot,
  type PayoutEpochRow,
} from "@/app/lib/payoutEpochs";
import { readSolanaPayoutConfig } from "@/lib/solanaPayoutConfig";
import {
  openSolanaEpoch,
  readSolanaConfig,
  readSolanaEpoch,
  readSolanaVaultBalance,
  type OpenSolanaEpochResult,
} from "@/lib/solanaOpenEpoch";
import { formatUsdcFromBaseUnits, parseUsdcToBaseUnits } from "@/lib/formatUsdc";
import { ensureVaultUsdcForEpoch } from "@/lib/solanaVaultFunding";
import { Connection, PublicKey } from "@solana/web3.js";

export type SolanaEpochPotMeta = {
  vaultBalance: string;
  totalReserved: string;
  availablePot: string;
  epochOpenOnChain?: OpenSolanaEpochResult;
};

export function isSolanaPayoutEnabled(): boolean {
  try {
    readSolanaPayoutConfig();
    return true;
  } catch {
    return false;
  }
}

export async function getAvailableSolanaEpochPot(
  connection: Connection,
  programId: PublicKey,
): Promise<{
  vaultBalance: bigint;
  totalReserved: bigint;
  availablePot: bigint;
} | null> {
  const onChain = await readSolanaConfig(connection, programId);
  const vaultBalance = await readSolanaVaultBalance(connection, programId);
  if (!onChain || vaultBalance === null) return null;

  const availablePot =
    vaultBalance > onChain.totalReserved
      ? vaultBalance - onChain.totalReserved
      : 0n;

  return {
    vaultBalance,
    totalReserved: onChain.totalReserved,
    availablePot,
  };
}

/** Fixed daily pot from SOLANA_DAILY_POT_USDC (e.g. 1500 or 1500.00). */
export function readSolanaDailyPotUsdcBaseUnits(): bigint | null {
  const raw =
    process.env.SOLANA_DAILY_POT_USDC?.trim() ||
    process.env.SOLANA_SNAPSHOT_POT_USDC?.trim() ||
    process.env.SOLANA_OPEN_EPOCH_POT_USDC?.trim();
  if (!raw) return null;
  try {
    const pot = parseUsdcToBaseUnits(raw);
    return pot > 0n ? pot : null;
  } catch {
    return null;
  }
}

export function resolveSolanaEpochPotAmount(
  freeUsdc: bigint,
): { ok: true; pot: bigint } | { ok: false; reason: string } {
  const fixed = readSolanaDailyPotUsdcBaseUnits();
  const pot = fixed ?? freeUsdc;

  if (pot <= 0n) {
    return { ok: false, reason: "Epoch pot must be greater than zero" };
  }

  if (freeUsdc < pot) {
    return {
      ok: false,
      reason: fixed
        ? `Vault has ${formatUsdcFromBaseUnits(freeUsdc)} free USDC but SOLANA_DAILY_POT_USDC requires ${formatUsdcFromBaseUnits(pot)}`
        : "Solana vault has no USDC available for a new epoch — fund the vault before snapshot",
    };
  }

  return { ok: true, pot };
}

/**
 * Ensures payout_epochs.pot_wei holds USDC base units (6 decimals) and opens the
 * matching Solana epoch. Uses SOLANA_DAILY_POT_USDC when set, else all free vault USDC.
 */
export async function ensureSolanaPayoutEpochForSnapshot(
  epochId: bigint,
): Promise<
  | {
      epoch: PayoutEpochRow;
      created: boolean;
      potSyncedFromContract: boolean;
      potSync: SolanaEpochPotMeta;
    }
  | { epoch: null; created: false; reason: string }
> {
  let config;
  try {
    config = readSolanaPayoutConfig();
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Solana payout not configured";
    return { epoch: null, created: false, reason };
  }

  const connection = new Connection(config.rpcUrl, "confirmed");
  const existing = await getPayoutEpoch(epochId);
  if (existing?.finalized_at) {
    return {
      epoch: existing,
      created: false,
      potSyncedFromContract: false,
      potSync: {
        vaultBalance: "0",
        totalReserved: "0",
        availablePot: "0",
      },
    };
  }

  let available = await getAvailableSolanaEpochPot(connection, config.programId);
  if (!available) {
    return {
      epoch: null,
      created: false,
      reason: "Solana config or vault token account not found",
    };
  }

  const targetPot = readSolanaDailyPotUsdcBaseUnits();
  if (targetPot && targetPot > available.availablePot) {
    const funded = await ensureVaultUsdcForEpoch({
      connection,
      programId: config.programId,
      usdcMint: config.usdcMint,
      requiredPot: targetPot,
      availablePot: available.availablePot,
    });
    if (!funded.ok) {
      return { epoch: null, created: false, reason: funded.reason };
    }
    if (funded.minted > 0n) {
      const refreshed = await getAvailableSolanaEpochPot(
        connection,
        config.programId,
      );
      if (refreshed) available = refreshed;
    }
  }

  const potSyncBase: SolanaEpochPotMeta = {
    vaultBalance: available.vaultBalance.toString(),
    totalReserved: available.totalReserved.toString(),
    availablePot: available.availablePot.toString(),
  };

  const resolvedPot = resolveSolanaEpochPotAmount(available.availablePot);
  if (!resolvedPot.ok) {
    if (available.availablePot <= 0n) {
      const onChainEpoch = await readSolanaEpoch(
        connection,
        config.programId,
        epochId,
      );
      const existingPot = existing ? parsePotWei(existing.pot_wei) : null;
      if (existing && existingPot && onChainEpoch?.open && onChainEpoch.pot > 0n) {
        let epoch = existing;
        if (existingPot !== onChainEpoch.pot) {
          await setPayoutEpochPotWei(epochId, onChainEpoch.pot);
          epoch = { ...existing, pot_wei: onChainEpoch.pot.toString() };
        }
        return {
          epoch,
          created: false,
          potSyncedFromContract: existingPot !== onChainEpoch.pot,
          potSync: {
            ...potSyncBase,
            epochOpenOnChain: {
              status: "already_open",
              epochId,
              pot: onChainEpoch.pot,
            },
          },
        };
      }
    }

    return {
      epoch: null,
      created: false,
      reason: resolvedPot.reason,
    };
  }

  const epochPot = resolvedPot.pot;
  const epoch = await upsertPayoutEpochPot(epochId, epochPot);
  const epochOpenOnChain = await openSolanaEpoch({
    epochId,
    pot: epochPot,
    connection,
  });

  if (epochOpenOnChain.status === "error") {
    return {
      epoch: null,
      created: false,
      reason: `Could not open Solana epoch: ${epochOpenOnChain.reason}`,
    };
  }

  if (epochOpenOnChain.status === "skipped") {
    return {
      epoch: null,
      created: false,
      reason: epochOpenOnChain.reason,
    };
  }

  const syncedPot = epochOpenOnChain.pot;
  let syncedEpoch = epoch;
  const priorPot = parsePotWei(epoch.pot_wei);
  if (priorPot !== syncedPot) {
    await setPayoutEpochPotWei(epochId, syncedPot);
    syncedEpoch = { ...epoch, pot_wei: syncedPot.toString() };
  }

  return {
    epoch: syncedEpoch,
    created: !existing,
    potSyncedFromContract: true,
    potSync: {
      ...potSyncBase,
      epochOpenOnChain,
    },
  };
}
