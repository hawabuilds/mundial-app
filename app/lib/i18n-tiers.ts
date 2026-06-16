import type { useTranslations } from "next-intl";

type TranslateFn = ReturnType<typeof useTranslations>;

/** Map reward/leaderboard tier labels to translated display names. */
export function translateTierLabel(t: TranslateFn, tier: string): string {
  switch (tier) {
    case "Tier 1":
      return t("tier1Name");
    case "Tier 2":
      return t("tier2Name");
    case "Tier 3":
      return t("tier3Name");
    default:
      return tier;
  }
}

export function tierRangeKey(
  pillClass: "tier1" | "tier2" | "tier3",
): "tier1Range" | "tier2Range" | "tier3Range" {
  switch (pillClass) {
    case "tier1":
      return "tier1Range";
    case "tier2":
      return "tier2Range";
    default:
      return "tier3Range";
  }
}

export function tierNameKey(
  pillClass: "tier1" | "tier2" | "tier3",
): "tier1Name" | "tier2Name" | "tier3Name" {
  switch (pillClass) {
    case "tier1":
      return "tier1Name";
    case "tier2":
      return "tier2Name";
    default:
      return "tier3Name";
  }
}
