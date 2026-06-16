export type LeaderboardPlayer = {
  r: number;
  h: string;
  pts: number;
  me: boolean;
  av: string;
};

export type LeaderboardTier = {
  name: string;
  range: string;
  start: number;
  end: number;
  pillClass: "tier1" | "tier2" | "tier3";
  rowClass: "t1" | "t2" | "";
  dimReward: boolean;
};

export const LB_PLAYERS: LeaderboardPlayer[] = [
  { r: 1, h: "@cryptoking", pts: 9210, me: false, av: "cryptoking" },
  { r: 2, h: "@nightowl", pts: 8450, me: false, av: "nightowl" },
  { r: 3, h: "@degensama", pts: 7100, me: false, av: "degensama" },
  { r: 4, h: "@predmaster", pts: 6880, me: false, av: "predmaster" },
  { r: 5, h: "@bnbwinner", pts: 6540, me: false, av: "bnbwinner" },
  { r: 6, h: "@soccerfan99", pts: 6120, me: false, av: "soccerfan99" },
  { r: 7, h: "@worldcupfan", pts: 5890, me: false, av: "worldcupfan" },
  { r: 8, h: "@binancebull", pts: 5620, me: false, av: "binancebull" },
  { r: 9, h: "@matchcaller", pts: 5410, me: false, av: "matchcaller" },
  { r: 10, h: "@xpredator", pts: 5100, me: false, av: "xpredator" },
  { r: 11, h: "@goalpro", pts: 4870, me: false, av: "goalpro" },
  { r: 12, h: "@bscpicker", pts: 4590, me: false, av: "bscpicker" },
  { r: 13, h: "@finalpred", pts: 4220, me: false, av: "finalpred" },
  { r: 14, h: "@jordanlee", pts: 3840, me: true, av: "jordanlee" },
  { r: 15, h: "@solflare99", pts: 3710, me: false, av: "solflare99" },
  { r: 16, h: "@waverly_x", pts: 3580, me: false, av: "waverly_x" },
  { r: 17, h: "@chainwatch", pts: 3400, me: false, av: "chainwatch" },
  { r: 18, h: "@apepredict", pts: 3250, me: false, av: "apepredict" },
  { r: 19, h: "@footballcoin", pts: 3100, me: false, av: "footballcoin" },
  { r: 20, h: "@scorefan2024", pts: 2980, me: false, av: "scorefan2024" },
];

export const LB_TIERS: LeaderboardTier[] = [
  {
    name: "Tier 1",
    range: "Top 3",
    start: 1,
    end: 3,
    pillClass: "tier1",
    rowClass: "t1",
    dimReward: false,
  },
  {
    name: "Tier 2",
    range: "Ranks 4–10",
    start: 4,
    end: 10,
    pillClass: "tier2",
    rowClass: "t2",
    dimReward: false,
  },
  {
    name: "Tier 3",
    range: "Ranks 11–20",
    start: 11,
    end: 20,
    pillClass: "tier3",
    rowClass: "",
    dimReward: true,
  },
];

export function tierForRank(rank: number): LeaderboardTier | undefined {
  return LB_TIERS.find((t) => rank >= t.start && rank <= t.end);
}

export function avatarInitials(av: string): string {
  return av.slice(0, 2).toUpperCase();
}
