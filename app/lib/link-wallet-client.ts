export type LinkWalletResponse = {
  wallet_address: string;
  updated_at: string;
};

export async function linkPayoutWallet(
  walletAddress: string,
): Promise<LinkWalletResponse> {
  const response = await fetch("/api/link-wallet", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });

  let body: (LinkWalletResponse & { error?: string }) | null = null;
  try {
    body = (await response.json()) as LinkWalletResponse & { error?: string };
  } catch {
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "Sign in with X first, then connect your wallet again"
          : `Failed to link payout wallet (${response.status})`,
      );
    }
    throw new Error("Invalid response from server");
  }

  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to link payout wallet");
  }

  if (!body) {
    throw new Error("Invalid response from server");
  }

  return body;
}
