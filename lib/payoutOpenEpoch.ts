import {
  payoutNativeSymbol,
} from "@/app/lib/payoutChainMeta";
import {
  createPayoutPublicClient,
  readMaxOpenEpochPotWei,
  readPublicPayoutConfig,
  scorePayoutAbi,
} from "@/lib/payoutContract";
import {
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

export type OnChainEpoch = {
  open: boolean;
  pot: bigint;
  claimedSum: bigint;
};

export type EnsureEpochOpenResult =
  | { status: "opened"; txHash: Hex; pot: bigint }
  | { status: "already_open"; pot: bigint }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

function chainForId(chainId: bigint) {
  return chainId === 97n ? bscTestnet : bsc;
}

const DEFAULT_BSC_RPC = "https://bsc-dataseed.binance.org/";
const PAYOUT_RPC_TIMEOUT_MS = 10_000;

function payoutRpcTransport() {
  const url = process.env.PAYOUT_RPC_URL?.trim() || DEFAULT_BSC_RPC;
  return http(url, { timeout: PAYOUT_RPC_TIMEOUT_MS, retryCount: 1 });
}

function readOperatorPrivateKey(): Hex | null {
  const raw =
    process.env.PAYOUT_OPERATOR_PRIVATE_KEY?.trim() ||
    process.env.OPERATOR_PRIVATE_KEY?.trim();
  if (!raw) return null;

  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) return null;
  return privateKey;
}

export function diagnosePayoutOperatorEnv(): string | null {
  const key = readOperatorPrivateKey();
  if (!key) {
    return "PAYOUT_OPERATOR_PRIVATE_KEY is not set — the server cannot call openEpoch on ScorePayout (must be the contract operator wallet; add key in Vercel)";
  }
  if (!readPublicPayoutConfig()) {
    return "Payout contract is not configured (PAYOUT_CONTRACT_ADDRESS + PAYOUT_CHAIN_ID)";
  }
  return null;
}

export async function readContractSignerAddress(): Promise<Address | null> {
  const config = readPublicPayoutConfig();
  if (!config) return null;

  const client = createPayoutPublicClient(config);
  return client.readContract({
    address: config.contractAddress,
    abi: scorePayoutAbi,
    functionName: "signer",
  });
}

export async function readLatestEpochIdOnChain(): Promise<bigint | null> {
  const config = readPublicPayoutConfig();
  if (!config) return null;

  const client = createPayoutPublicClient(config);
  return client.readContract({
    address: config.contractAddress,
    abi: scorePayoutAbi,
    functionName: "latestEpochId",
  });
}

export async function readOnChainEpoch(
  epochId: bigint,
): Promise<OnChainEpoch | null> {
  const config = readPublicPayoutConfig();
  if (!config) return null;

  const client = createPayoutPublicClient(config);
  const [pot, claimedSum, open] = await client.readContract({
    address: config.contractAddress,
    abi: scorePayoutAbi,
    functionName: "epochs",
    args: [epochId],
  });

  return { open, pot, claimedSum };
}

/**
 * Opens the epoch on ScorePayout with the given pot (operator tx).
 * Idempotent when the epoch is already open with the same pot.
 */
export async function ensureEpochOpenedOnChain(
  epochId: bigint,
  potWei: bigint,
): Promise<EnsureEpochOpenResult> {
  const config = readPublicPayoutConfig();
  if (!config) {
    return { status: "skipped", reason: "Payout contract not configured" };
  }

  if (potWei <= 0n) {
    return { status: "error", reason: "Epoch pot must be greater than zero" };
  }

  const nativeSymbol = payoutNativeSymbol(Number(config.chainId));

  const funding = await readMaxOpenEpochPotWei();
  if (!funding) {
    return { status: "skipped", reason: "Payout contract not configured" };
  }

  const potToOpen =
    potWei > funding.maxPot ? funding.maxPot : potWei;
  if (potToOpen <= 0n) {
    return {
      status: "error",
      reason: `Contract holds ${formatBnb(funding.balance)} ${nativeSymbol} with ${formatBnb(funding.totalReserved)} already reserved — no unreserved balance left for a new epoch`,
    };
  }

  const existing = await readOnChainEpoch(epochId);
  if (existing?.open) {
    if (existing.pot === potToOpen || existing.pot === potWei) {
      return { status: "already_open", pot: existing.pot };
    }
    return {
      status: "error",
      reason: `Epoch ${epochId} is already open on-chain with pot ${formatBnb(existing.pot)} ${nativeSymbol}, but the app expects ${formatBnb(potWei)} — openEpoch cannot change the pot; align funding or contact the operator`,
    };
  }

  const operatorKey = readOperatorPrivateKey();
  if (!operatorKey) {
    return {
      status: "skipped",
      reason: diagnosePayoutOperatorEnv() ?? "Operator key not configured",
    };
  }

  const latest = await readLatestEpochIdOnChain();
  if (latest !== null && epochId <= latest) {
    return {
      status: "error",
      reason: `Cannot open epoch ${epochId} on-chain: contract latestEpochId is ${latest.toString()} (epochs must strictly increase). This day may have been skipped when a later epoch was opened manually in Remix`,
    };
  }

  const account = privateKeyToAccount(operatorKey);
  const chain = chainForId(config.chainId);
  const wallet = createWalletClient({
    account,
    chain,
    transport: payoutRpcTransport(),
  });

  try {
    const hash = await wallet.writeContract({
      address: config.contractAddress,
      abi: scorePayoutAbi,
      functionName: "openEpoch",
      args: [epochId, potToOpen],
      chain,
    });

    const publicClient = createPayoutPublicClient(config);
    await publicClient.waitForTransactionReceipt({ hash });

    return { status: "opened", txHash: hash, pot: potToOpen };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "openEpoch transaction failed";
    if (/insufficient BNB held/i.test(message)) {
      return {
        status: "error",
        reason: `Contract cannot reserve ${formatBnb(potToOpen)} ${nativeSymbol} for this epoch — balance ${formatBnb(funding.balance)}, already reserved on-chain ${formatBnb(funding.totalReserved)} (max new pot ≈ ${formatBnb(funding.maxPot)} ${nativeSymbol})`,
      };
    }
    if (/epochId not increasing/i.test(message)) {
      return {
        status: "error",
        reason: `openEpoch rejected: ${message}. A later epoch may already be open on-chain`,
      };
    }
    return { status: "error", reason: message };
  }
}

function formatBnb(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n) / 10n ** 14n;
  return frac > 0n ? `${whole}.${frac.toString().padStart(4, "0").replace(/0+$/, "")}` : whole.toString();
}

export async function readEpochRemainingWei(
  epochId: bigint,
): Promise<bigint | null> {
  const config = readPublicPayoutConfig();
  if (!config) return null;

  const client = createPayoutPublicClient(config);
  return client.readContract({
    address: config.contractAddress,
    abi: scorePayoutAbi,
    functionName: "epochRemaining",
    args: [epochId],
  });
}
