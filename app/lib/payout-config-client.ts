import { getAddress, type Address } from "viem";
import { getPayoutContractAddress, PAYOUT_CHAIN_ID } from "./payoutConfig";

export type ClientPayoutConfig = {
  contractAddress: Address;
  chainId: number;
};

let cached: ClientPayoutConfig | null = null;
let inflight: Promise<ClientPayoutConfig | null> | null = null;

function fromEnv(): ClientPayoutConfig | null {
  const contractAddress = getPayoutContractAddress();
  if (!contractAddress) return null;
  return { contractAddress, chainId: PAYOUT_CHAIN_ID };
}

/** Resolves payout target from build-time env or `/api/payout-config`. */
export async function resolveClientPayoutConfig(): Promise<ClientPayoutConfig | null> {
  const envConfig = fromEnv();
  if (envConfig) return envConfig;

  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/payout-config", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as {
        contractAddress?: string;
        chainId?: string;
      };
      if (!body.contractAddress || !body.chainId) return null;
      try {
        return {
          contractAddress: getAddress(body.contractAddress),
          chainId: Number.parseInt(body.chainId, 10),
        };
      } catch {
        return null;
      }
    })
    .then((config) => {
      cached = config;
      inflight = null;
      return config;
    })
    .catch(() => {
      inflight = null;
      return null;
    });

  return inflight;
}

export function getPayoutExplorerTxUrl(chainId: number, txHash: string): string {
  const base =
    chainId === 97
      ? "https://testnet.bscscan.com/tx/"
      : chainId === 56
        ? "https://bscscan.com/tx/"
        : null;
  return base ? `${base}${txHash}` : txHash;
}
