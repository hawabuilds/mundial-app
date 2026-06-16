import type { ShareCardData } from "@/app/components/CelebrationCard";

const STORAGE_KEY = "gts-pending-celebration";

export type PendingCelebration = ShareCardData & {
  epochId: string;
  txHash?: string;
  chainId?: number;
};

export function savePendingCelebration(data: PendingCelebration): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPendingCelebration(): PendingCelebration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingCelebration;
  } catch {
    return null;
  }
}

export function clearPendingCelebration(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function pendingToShareCard(
  pending: PendingCelebration,
): ShareCardData {
  return {
    tier: pending.tier,
    day: pending.day,
    date: pending.date,
    bnb: pending.bnb,
    multi: pending.multi,
  };
}
