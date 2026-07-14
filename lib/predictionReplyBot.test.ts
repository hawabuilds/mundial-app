import assert from "node:assert/strict";
import {
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
  PREDICTION_REPLY_BOT_MESSAGE.includes("@copamundialapp"),
  "message points to @copamundialapp bio",
);
assert.ok(
  /bio/i.test(PREDICTION_REPLY_BOT_MESSAGE),
  "message mentions bio for the web link",
);
assert.ok(
  !/copamundial\.app|discord\.gg|https?:\/\//i.test(PREDICTION_REPLY_BOT_MESSAGE),
  "message must not include URL entities (plain-text write rate)",
);
assert.ok(
  !/bonus/i.test(PREDICTION_REPLY_BOT_MESSAGE),
  "message must not mention bonus points",
);

assert.equal(
  predictionReplyBotMaxPerRun(),
  null,
  "per-run send cap defaults OFF (flush all pending)",
);

console.log("predictionReplyBot.test.ts: ok");
