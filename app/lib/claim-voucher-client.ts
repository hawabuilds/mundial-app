export type ClaimVoucherResponse = {
  epochId: string;
  to: string;
  amount: string;
  rank: number;
  alreadyClaimed?: boolean;
  voucherId?: string;
  signature?: string;
};

export async function claimPayoutVoucher(
  epochId: string | number | bigint,
  to: string,
): Promise<ClaimVoucherResponse> {
  const response = await fetch("/api/claim-voucher", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ epochId: String(epochId), to }),
  });

  const body = (await response.json()) as ClaimVoucherResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Failed to claim voucher");
  }

  return body;
}
