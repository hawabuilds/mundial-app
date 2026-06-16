export type SolanaClaimVoucherResponse = {
  epochId: string;
  amount: string;
  rank: number;
  owner: string;
  recipientToken: string;
  voucherId: string;
  messageHash: string;
  signature: string;
  signerPublicKey: string;
  programId: string;
  usdcMint: string;
  rpcUrl: string;
  cluster: "devnet" | "mainnet-beta";
  programDeployed: boolean;
  accounts: {
    config: string;
    vault: string;
    epoch: string;
    claimMarker: string;
  };
};

export async function fetchSolanaClaimVoucher(params: {
  epochId: string;
  owner: string;
  recipientToken: string;
}): Promise<SolanaClaimVoucherResponse> {
  const response = await fetch("/api/solana/claim-voucher", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const body = (await response.json()) as SolanaClaimVoucherResponse & {
    error?: string;
    alreadyClaimed?: boolean;
  };

  if (!response.ok) {
    throw new Error(body.error ?? `Voucher request failed (${response.status})`);
  }

  return body;
}
