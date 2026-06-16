import assert from "node:assert/strict";
import type { Fixture } from "@/app/data/fixtures";
import { fixtureAutoSettlesFromApi } from "./fixtureAutoSettle";

const base: Pick<Fixture, "group" | "autoSettleFromApi" | "externalFixtureId"> = {
  group: "International Friendly",
  externalFixtureId: 123,
};

assert.equal(fixtureAutoSettlesFromApi(base), false, "friendlies need explicit flag");

assert.equal(
  fixtureAutoSettlesFromApi({ ...base, group: "FIFA World Cup · Group A" }),
  true,
  "World Cup group enables API auto-settle",
);

assert.equal(
  fixtureAutoSettlesFromApi({ ...base, autoSettleFromApi: true }),
  true,
  "explicit override",
);

assert.equal(
  fixtureAutoSettlesFromApi({
    group: "FIFA World Cup",
    autoSettleFromApi: true,
  }),
  false,
  "needs externalFixtureId",
);

console.log("fixtureAutoSettle.test.ts: ok");
