export type Fixture = {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  group: string;
};

export type Standing = {
  place: number;
  handle: string;
  pts: number;
  you?: boolean;
};

export type Payout = {
  id: string;
  date: string;
  place: number;
  sol: number;
  state: "open" | "done";
};

export const FIXTURES: Fixture[] = [
  {
    id: "f1",
    home: "Brazil",
    away: "Morocco",
    kickoff: "Today · 19:00 UTC",
    group: "Group F",
  },
  {
    id: "f2",
    home: "United States",
    away: "Paraguay",
    kickoff: "Tomorrow · 01:00 UTC",
    group: "Group D",
  },
  {
    id: "f3",
    home: "Qatar",
    away: "Switzerland",
    kickoff: "Tomorrow · 16:00 UTC",
    group: "Group B",
  },
];

export const STANDINGS: Standing[] = [
  { place: 1, handle: "@northline", pts: 3120 },
  { place: 2, handle: "@finalthird", pts: 2984 },
  { place: 3, handle: "@you", pts: 2410, you: true },
  { place: 4, handle: "@wideangle", pts: 2290 },
  { place: 5, handle: "@setpiece", pts: 2188 },
  { place: 6, handle: "@touchline", pts: 2055 },
];

export const PAYOUTS: Payout[] = [
  { id: "p1", date: "11 Jun", place: 3, sol: 0.38, state: "open" },
  { id: "p2", date: "8 Jun", place: 6, sol: 0.14, state: "done" },
];

export const YOU = { place: 3, pts: 2410, handle: "@you" };
