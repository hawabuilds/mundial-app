import {
  getPayoutEpoch,
  parsePotWei,
  setPayoutEpochPotWei,
} from "@/app/lib/payoutEpochs";
import { readMaxOpenEpochPotWei } from "@/lib/payoutContract";
import { readOnChainEpoch } from "@/lib/payoutOpenEpoch";

/**
 * Pot used for tier math: on-chain epoch pot when open, else DB row.
 * New epochs should match openEpoch on the contract (balance − totalReserved).
 */
export async function resolveEffectiveEpochPotWei(
  epochId: bigint,
): Promise<bigint | null> {
  const onChain = await readOnChainEpoch(epochId);
  if (onChain?.open && onChain.pot > 0n) {
    return onChain.pot;
  }

  const row = await getPayoutEpoch(epochId);
  return parsePotWei(row?.pot_wei);
}

/** Max pot the contract can reserve for a new epoch (balance − totalReserved). */
export async function readNewEpochPotWei(): Promise<{
  balance: bigint;
  totalReserved: bigint;
  pot: bigint;
} | null> {
  const funding = await readMaxOpenEpochPotWei();
  if (!funding) return null;
  return {
    balance: funding.balance,
    totalReserved: funding.totalReserved,
    pot: funding.maxPot,
  };
}

/** Keep payout_epochs.pot_wei aligned with the opened on-chain pot. */
export async function syncPayoutEpochPotFromChain(
  epochId: bigint,
): Promise<void> {
  const onChain = await readOnChainEpoch(epochId);
  if (!onChain?.open || onChain.pot <= 0n) return;

  const row = await getPayoutEpoch(epochId);
  if (!row) return;
  if (row.pot_wei === onChain.pot.toString()) return;

  await setPayoutEpochPotWei(epochId, onChain.pot);
}
