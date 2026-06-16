import type { ClaimableRewardDto } from "@/app/lib/listUserClaimableRewards";

export type ClaimableRewardsResponse = {
  rewards: ClaimableRewardDto[];
};

export async function fetchClaimableRewards(): Promise<ClaimableRewardDto[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  let response: Response;
  try {
    response = await fetch("/api/me/claimable-rewards", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const body = (await response.json()) as ClaimableRewardsResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? "Failed to load rewards");
  }

  return body.rewards;
}
