export type LinkedPayoutWallet = {
  linkedWallet: string | null;
  updatedAt: string | null;
};

export async function fetchLinkedPayoutWallet(): Promise<LinkedPayoutWallet> {
  const response = await fetch("/api/me/payout-wallet", {
    credentials: "include",
    cache: "no-store",
  });
  const body = (await response.json()) as LinkedPayoutWallet & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Failed to load linked wallet");
  }
  return body;
}
