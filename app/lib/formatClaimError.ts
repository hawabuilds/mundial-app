import { sanitizeWalletMessage } from "@/app/lib/isWalletConnect";
import {
  payoutChainLabel,
  payoutNativeSymbol,
  resolvePayoutChainId,
} from "@/app/lib/payoutChainMeta";
import { UserRejectedRequestError } from "viem";

export function formatClaimError(err: unknown, chainId?: number): string {
  const payoutChainId = resolvePayoutChainId(chainId);
  const chainLabel = payoutChainLabel(payoutChainId);
  const nativeSymbol = payoutNativeSymbol(payoutChainId);

  if (err instanceof UserRejectedRequestError) {
    return "Transaction cancelled in your wallet";
  }

  const raw = err instanceof Error ? err.message : String(err);
  const message = sanitizeWalletMessage(raw);

  if (/walletconnect|qr code|relay|session/i.test(raw)) {
    return "WalletConnect did not finish — confirm on your phone, then return to this browser tab and try Claim again. For fewer steps, use MetaMask in the same browser (not QR).";
  }
  if (/insufficient funds/i.test(message)) {
    return `Not enough ${nativeSymbol} for gas — add a small amount on ${chainLabel} to your wallet`;
  }

  if (/wallet client/i.test(message) || /connector/i.test(message)) {
    return "Wallet not ready — open MetaMask and connect on the Wallet tab first";
  }

  if (/switch/i.test(message) && /chain|network/i.test(message)) {
    return `Switch your wallet to ${chainLabel}, then try Claim again`;
  }

  if (/voucher used/i.test(message) || /already claimed/i.test(message)) {
    return "This day's reward was already claimed — check the wallet you used when you claimed before (Claim history). Switching MetaMask does not pay the same day again.";
  }

  if (/epoch not open/i.test(message)) {
    return `This day's pool is not opened on the payout contract yet — wait for the daily snapshot or ask the operator to run openEpoch on ${chainLabel}`;
  }

  if (/bad signature/i.test(message)) {
    return "Voucher signature rejected — SIGNER_PRIVATE_KEY on the server must match the ScorePayout signer address set in the constructor";
  }

  if (/exceeds epoch pot/i.test(message)) {
    return "Payout exceeds this day's funded pot on-chain — the operator may have opened the epoch with a smaller pot than the app expects";
  }

  if (/paused/i.test(message)) {
    return "Payout contract is paused — contact the operator";
  }

  if (/does not match your linked payout wallet/i.test(message)) {
    return message;
  }

  if (/execution reverted/i.test(message) || /revert/i.test(message)) {
    const detail = message
      .replace(/^execution reverted:?\s*/i, "")
      .replace(/^reverted:?\s*/i, "")
      .trim();
    if (detail && detail.length < 120 && !/^0x/i.test(detail)) {
      return `Claim rejected: ${detail} — use ${chainLabel} (chain ${payoutChainId}) and your linked wallet`;
    }
    return `Claim rejected by contract — use ${chainLabel} (chain ${payoutChainId}), your linked wallet, and ensure today's epoch is opened on-chain`;
  }

  if (message.length > 220) {
    return `${message.slice(0, 220)}…`;
  }
  return message || "Claim failed — try again from the Wallet tab using MetaMask in this browser";
}
