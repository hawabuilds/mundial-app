export const BNB_USD = 600;

export type Reward = {
  id: string;
  day: string;
  date: string;
  rank: number;
  tier: string;
  pts: number;
  bnb: number;
  claimed: boolean;
  txDate?: string;
};

export const INITIAL_REWARDS: Reward[] = [
  {
    id: "d3",
    day: "Today",
    date: "May 23",
    rank: 14,
    tier: "Tier 3",
    pts: 3840,
    bnb: 0.08,
    claimed: false,
  },
  {
    id: "d2",
    day: "Yesterday",
    date: "May 22",
    rank: 7,
    tier: "Tier 2",
    pts: 5210,
    bnb: 0.15,
    claimed: false,
  },
  {
    id: "d1",
    day: "Mon",
    date: "May 19",
    rank: 3,
    tier: "Tier 1",
    pts: 8650,
    bnb: 0.42,
    claimed: true,
    txDate: "May 19",
  },
  {
    id: "d0",
    day: "Sun",
    date: "May 18",
    rank: 11,
    tier: "Tier 3",
    pts: 3120,
    bnb: 0.06,
    claimed: true,
    txDate: "May 18",
  },
];

export function usd(bnb: number) {
  return `$${(bnb * BNB_USD).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export function bnbStr(b: number) {
  if (!Number.isFinite(b) || b <= 0) return "0";
  const digits = b >= 1 ? 4 : b >= 0.01 ? 5 : 8;
  return b.toFixed(digits).replace(/\.?0+$/, "");
}
