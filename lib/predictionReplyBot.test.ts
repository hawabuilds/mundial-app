import assert from "node:assert/strict";
import {
  isPredictionReplyBotEnabled,
  isPredictionReplyBotFirstTimeOnly,
  PREDICTION_REPLY_BOT_MESSAGE,
  predictionReplyBotMaxPerHour,
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
  PREDICTION_REPLY_BOT_MESSAGE.includes("copamundial.app"),
  "message links to web app",
);
assert.ok(
  PREDICTION_REPLY_BOT_MESSAGE.includes("discord.gg/BS3q3aMFd"),
  "message links to Discord",
);
assert.ok(
  !/bonus/i.test(PREDICTION_REPLY_BOT_MESSAGE),
  "message must not mention bonus points",
);

assert.equal(predictionReplyBotMaxPerHour(), 10);
assert.equal(predictionReplyBotMaxPerRun(), 5);

console.log("predictionReplyBot.test.ts: ok");
