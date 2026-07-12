import type { MundialFixture } from "./fixtures";
import { dualProofPopoverIntro } from "@/lib/txScoreProofSemantics";

/**
 * Argentina vs Egypt (Mundial fixture 80) — sourced from production Supabase
 * match_state, match_proofs, match_odds on 2026-07-09. match_goals empty.
 */
export const ARG_EGYPT_PROOF_FIXTURE: MundialFixture = {
  id: 80,
  home: "Argentina",
  away: "Egypt",
  homeCode: "AR",
  awayCode: "EG",
  date: "2026-07-07",
  time: "16:00",
  stage: "World Cup",
  venueLine: "",
  status: "FT",
  statusLabel: "FT",
  homeScore: 3,
  awayScore: 2,
  elapsed: null,
  phase: "recent",
  goals: [],
  marketOdds: {
    homePct: 71.48,
    drawPct: 19.234,
    awayPct: 9.259,
  },
  terminalStatusId: 100,
  txlineProof: {
    fixtureId: 80,
    txFixtureId: 18202701,
    seq: 1045,
    proofTs: 1783448117169,
    proofReference: "DGeB385a3fQ+uNpCNsxdAggo20np+ISGYxNF966OANc=",
    stats: [
      { key: 1001, value: 0, period: 100 },
      { key: 1002, value: 1, period: 100 },
      { key: 3001, value: 3, period: 100 },
      { key: 3002, value: 1, period: 100 },
    ],
    solanaExplorerUrl: null,
    fetchedAt: "2026-07-07T18:20:51.489Z",
    showVerifiedBadge: true,
    semanticsMismatch: false,
    proofMode: "regulation",
    verificationCopy: dualProofPopoverIntro(),
    officialStats: [
      { key: 1, value: 3, period: 100 },
      { key: 2, value: 2, period: 100 },
    ],
    regulationStats: [
      { key: 1001, value: 0, period: 100 },
      { key: 1002, value: 1, period: 100 },
      { key: 3001, value: 3, period: 100 },
      { key: 3002, value: 1, period: 100 },
    ],
    officialSeq: 1045,
    regulationSeq: 1045,
    seqSource: "game_finalised",
  },
};
