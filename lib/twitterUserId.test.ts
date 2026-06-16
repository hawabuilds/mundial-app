import assert from "node:assert/strict";
import {
  getTwitterUserIdFromSession,
  isTwitterNumericUserId,
  pickTwitterUserIdFromToken,
} from "./twitterUserId";

assert.equal(isTwitterNumericUserId("3120013892"), true);
assert.equal(isTwitterNumericUserId("oauth:3120013892"), false);
assert.equal(isTwitterNumericUserId("hawadoteth"), false);

assert.equal(
  pickTwitterUserIdFromToken({
    twitterId: null,
    sub: "3120013892",
  }),
  "3120013892",
);

assert.equal(
  getTwitterUserIdFromSession({
    user: { id: "3120013892", username: "hawadoteth", name: "@hawadoteth" },
  }),
  "3120013892",
);

assert.equal(
  getTwitterUserIdFromSession({
    user: {
      id: "https://twitter.com/intent/user?user_id=3120013892",
      username: "hawadoteth",
    },
  }),
  null,
);

console.log("twitterUserId.test.ts: ok");
