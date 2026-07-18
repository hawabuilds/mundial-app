import assert from "node:assert/strict";
import {
  looksLikeInvalidPredictionAttempt,
  parsePrediction,
} from "./predictionParser";
import {
  formatPredictionReplyBotNudgeMessage,
  isPredictionReplyBotEnabled,
  isPredictionReplyBotFirstTimeOnly,
  PREDICTION_REPLY_BOT_MESSAGE,
  predictionReplyBotMaxPerRun,
} from "./predictionReplyBot";

assert.equal(
  isPredictionReplyBotEnabled(),
  false,
  "reply bot defaults OFF",
);

assert.equal(
  isPredictionReplyBotFirstTimeOnly(),
  false,
  "first-time-only defaults OFF",
);

assert.ok(
  /first goalscorer/i.test(PREDICTION_REPLY_BOT_MESSAGE),
  "success message directs users to first-goalscorer pick",
);

const nudge = formatPredictionReplyBotNudgeMessage("France", "England");
assert.ok(
  nudge.includes("France 2-1 England"),
  "nudge includes example template",
);
assert.ok(
  /first valid reply before kickoff/i.test(nudge),
  "nudge mentions kickoff rule",
);

const MATCH = { home: "Saint-Étienne", away: "Nice" };

assert.equal(parsePrediction("Saint-Étienne 2-1 Nice", MATCH)?.homeScore, 2);
assert.equal(
  looksLikeInvalidPredictionAttempt("Saint-Étienne 2-1 Nice", MATCH),
  false,
  "valid pick is not an invalid attempt",
);

assert.equal(
  looksLikeInvalidPredictionAttempt("2-1", MATCH),
  true,
  "bare score is an invalid attempt",
);

assert.equal(
  looksLikeInvalidPredictionAttempt("Saint-Étienne 2-1", MATCH),
  true,
  "one team + score is an invalid attempt",
);

assert.equal(
  looksLikeInvalidPredictionAttempt("Come on Saint-Étienne!", MATCH),
  false,
  "hype without score is not nudged",
);

assert.equal(
  predictionReplyBotMaxPerRun(),
  null,
  "per-run send cap defaults OFF (flush all pending)",
);

console.log("predictionReplyBot.test.ts: ok");
