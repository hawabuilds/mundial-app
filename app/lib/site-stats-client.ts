import type { SiteStats } from "@/lib/siteStats";

export async function fetchSiteStats(): Promise<SiteStats> {
  const response = await fetch("/api/site-stats", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load site stats");
  }
  return (await response.json()) as SiteStats;
}

export function formatPrizePoolUsd(
  amount: number | null,
  atSnapshot = false,
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  const hasCents = cents % 100 !== 0;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: atSnapshot && hasCents ? 2 : 0,
    maximumFractionDigits: atSnapshot && hasCents ? 2 : 0,
  })}`;
}
