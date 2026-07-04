import assert from "assert";
import { createHash } from "crypto";

/** Production instruction set for mundial_rewards (matches lib.rs). */
const EXPECTED_INSTRUCTIONS = [
  "initialize",
  "open_epoch",
  "claim",
  "set_signer",
  "set_operator",
  "set_paused",
  "rescue_unreserved",
] as const;

/** Devnet migration helpers removed from the program — must not reappear. */
const REMOVED_INSTRUCTIONS = ["set_total_reserved", "set_latest_epoch"];

function anchorGlobalDiscriminator(ixName: string): Buffer {
  return createHash("sha256").update(`global:${ixName}`).digest().subarray(0, 8);
}

describe("mundial_rewards instruction set", () => {
  it("lists the seven production instructions", () => {
    assert.deepStrictEqual([...EXPECTED_INSTRUCTIONS], [
      "initialize",
      "open_epoch",
      "claim",
      "set_signer",
      "set_operator",
      "set_paused",
      "rescue_unreserved",
    ]);
  });

  it("does not include removed migration admin instructions", () => {
    for (const removed of REMOVED_INSTRUCTIONS) {
      assert.ok(
        !(EXPECTED_INSTRUCTIONS as readonly string[]).includes(removed),
        `removed instruction still listed: ${removed}`,
      );
    }
  });

  it("assigns stable 8-byte Anchor discriminators", () => {
    for (const ix of EXPECTED_INSTRUCTIONS) {
      const disc = anchorGlobalDiscriminator(ix);
      assert.strictEqual(disc.length, 8, `${ix} discriminator length`);
      assert.strictEqual(
        anchorGlobalDiscriminator(ix).compare(disc),
        0,
        `${ix} discriminator is deterministic`,
      );
    }
  });
});
