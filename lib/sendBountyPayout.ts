import { readPublicPayoutConfig } from "@/lib/payoutContract";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";

function chainForId(chainId: bigint) {
  return chainId === 97n ? bscTestnet : bsc;
}

function payoutRpcTransport() {
  const url = process.env.PAYOUT_RPC_URL?.trim();
  return http(url || undefined);
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

export function diagnoseBountyPayoutEnv(): string | null {
  if (!readOperatorPrivateKey()) {
    return "PAYOUT_OPERATOR_PRIVATE_KEY is not set on the server — bounty payouts are sent from the operator wallet";
  }
  if (!readPublicPayoutConfig()) {
    return "PAYOUT_CHAIN_ID is not configured on the server";
  }
  return null;
}

/**
 * Sends the bounty reward as a direct BNB transfer from the operator wallet.
 * Bounties intentionally do NOT use the ScorePayout epoch contract — its epoch
 * ids must strictly increase, so synthetic bounty epochs would block daily payouts.
 */
export async function sendBountyPayout(params: {
  to: Address;
  amountWei: bigint;
}): Promise<Hex> {
  const operatorKey = readOperatorPrivateKey();
  const config = readPublicPayoutConfig();
  if (!operatorKey || !config) {
    throw new Error(diagnoseBountyPayoutEnv() ?? "Bounty payout not configured");
  }

  const account = privateKeyToAccount(operatorKey);
  const chain = chainForId(config.chainId);
  const transport = payoutRpcTransport();

  const publicClient = createPublicClient({ chain, transport });
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < params.amountWei) {
    throw new Error(
      `Operator wallet holds ${balance.toString()} wei but the bounty reward is ${params.amountWei.toString()} wei — top up the operator wallet`,
    );
  }

  const wallet = createWalletClient({ account, chain, transport });
  const hash = await wallet.sendTransaction({
    to: params.to,
    value: params.amountWei,
    chain,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
