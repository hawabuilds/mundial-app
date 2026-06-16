/** Stable URL hash ids + next-intl message keys for each FAQ entry. */
export const FAQ_ITEMS = [
  {
    id: "what-is",
    key: "whatIs",
    topics: ["basics"],
    keywords: ["game", "play", "free", "skill", "prediction", "bnb", "wallet"],
  },
  {
    id: "is-gambling",
    key: "isGambling",
    topics: ["basics", "legal"],
    keywords: ["gambling", "gamble", "betting", "sportsbook", "legal", "advice"],
  },
  {
    id: "fifa-affiliation",
    key: "fifaAffiliation",
    topics: ["basics", "legal"],
    keywords: ["fifa", "affiliated", "league", "club", "official"],
  },
  {
    id: "need-wallet-to-play",
    key: "needWalletToPlay",
    topics: ["wallet", "play"],
    keywords: ["wallet", "crypto", "metamask", "bsc", "play", "twitter"],
  },
  {
    id: "how-to-play",
    key: "howToPlay",
    topics: ["play"],
    keywords: ["play", "start", "sign in", "reply", "predict", "kickoff", "twitter"],
  },
  {
    id: "where-to-post",
    key: "whereToPost",
    topics: ["play"],
    keywords: ["post", "reply", "tweet", "thread", "prediction", "twitter"],
  },
  {
    id: "deadline",
    key: "deadline",
    topics: ["play"],
    keywords: ["deadline", "kickoff", "time", "utc", "before", "late"],
  },
  {
    id: "change-prediction",
    key: "changePrediction",
    topics: ["play"],
    keywords: ["change", "edit", "update", "prediction", "one", "first"],
  },
  {
    id: "reply-not-counted",
    key: "replyNotCounted",
    topics: ["play"],
    keywords: ["counted", "missing", "ignored", "reply", "format", "thread"],
  },
  {
    id: "extra-time",
    key: "extraTime",
    topics: ["play", "scoring"],
    keywords: ["extra time", "penalties", "penalty", "overtime", "90 minutes"],
  },
  {
    id: "points-scoring",
    key: "pointsScoring",
    topics: ["scoring"],
    keywords: ["points", "score", "scoring", "exact", "outcome", "how does scoring work"],
  },
  {
    id: "points-updated",
    key: "pointsUpdated",
    topics: ["scoring"],
    keywords: [
      "points updated",
      "when are points updated",
      "when do points update",
      "update points",
      "leaderboard update",
      "full time",
      "after match",
      "how long",
      "积分更新",
      "什么时候更新",
      "何时更新",
    ],
  },
  {
    id: "leaderboard",
    key: "leaderboard",
    topics: ["scoring", "payout"],
    keywords: ["leaderboard", "rank", "ranking", "points", "reset", "top"],
  },
  {
    id: "who-gets-paid",
    key: "whoGetsPaid",
    topics: ["payout"],
    keywords: ["paid", "payout", "prize", "prizes", "top 20", "winner", "winners", "who wins prizes"],
  },
  {
    id: "snapshot-when",
    key: "snapshotWhen",
    topics: ["payout"],
    keywords: ["snapshot", "12:00 utc", "utc", "daily", "lock", "when"],
  },
  {
    id: "prize-split",
    key: "prizeSplit",
    topics: ["payout"],
    keywords: ["split", "pool", "percent", "10%", "5%", "2.5%", "tier"],
  },
  {
    id: "pool-size",
    key: "poolSize",
    topics: ["payout"],
    keywords: ["pool", "size", "daily", "amount", "fund", "bnb"],
  },
  {
    id: "how-to-claim",
    key: "howToClaim",
    topics: ["claim", "wallet", "payout"],
    keywords: [
      "how to claim",
      "how do i claim",
      "how can i claim",
      "how claim",
      "claim",
      "claiming",
      "claim reward",
      "claim bnb",
      "claim prizes",
      "withdraw",
      "payout",
      "wallet",
      "metamask",
      "bnb",
      "gas",
      "reward",
      "领取",
      "怎么领",
      "如何领取",
    ],
  },
  {
    id: "claim-empty",
    key: "claimEmpty",
    topics: ["claim", "payout"],
    keywords: ["empty", "claim", "top 20", "missing", "epoch", "snapshot"],
  },
  {
    id: "what-is-score-token",
    key: "whatIsScoreToken",
    topics: ["score", "token"],
    keywords: ["score token", "token", "flap", "bsc", "coin", "buy", "hold"],
  },
  {
    id: "score-taxes",
    key: "scoreTaxes",
    topics: ["tax", "score", "token"],
    keywords: [
      "tax",
      "taxes",
      "fee",
      "fees",
      "3%",
      "3/3",
      "buy tax",
      "sell tax",
      "what are the taxes",
      "score taxes",
    ],
  },
  {
    id: "score-tax-split",
    key: "scoreTaxSplit",
    topics: ["tax", "score", "token"],
    keywords: [
      "where will taxes go",
      "where do taxes go",
      "where taxes go",
      "taxes go",
      "tax split",
      "taxes",
      "split",
      "burn",
      "buyback",
      "vault",
      "development",
      "destination",
      "税费",
      "去向",
      "销毁",
      "开发",
      "金库",
    ],
  },
  {
    id: "score-connects-game",
    key: "scoreConnectsGame",
    topics: ["score", "token", "payout"],
    keywords: ["score token", "connect", "fund", "prize", "leaderboard", "volume"],
  },
  {
    id: "need-help",
    key: "needHelp",
    topics: ["support"],
    keywords: ["help", "support", "contact", "screenshot", "handle", "link"],
  },
  {
    id: "full-rules",
    key: "fullRules",
    topics: ["legal"],
    keywords: ["rules", "disclaimer", "faq", "full", "terms"],
  },
] as const;

export type FaqItemId = (typeof FAQ_ITEMS)[number]["id"];
export type FaqItemKey = (typeof FAQ_ITEMS)[number]["key"];
export type FaqTopic =
  | "basics"
  | "legal"
  | "play"
  | "wallet"
  | "scoring"
  | "payout"
  | "claim"
  | "score"
  | "token"
  | "tax"
  | "support";

export function faqItemHasTopic(
  item: (typeof FAQ_ITEMS)[number],
  topic: FaqTopic,
): boolean {
  return (item.topics as readonly FaqTopic[]).includes(topic);
}
