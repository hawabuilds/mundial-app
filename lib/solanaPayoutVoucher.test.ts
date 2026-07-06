import { Keypair, PublicKey } from "@solana/web3.js";
import {
  computeSolanaVoucherMessageHash,
  signSolanaVoucherMessage,
} from "./solanaPayoutVoucher";
import {
  findClaimMarkerPda,
  findConfigPda,
  findEpochPda,
  findVaultPda,
} from "./solanaPayoutPdas";

/** Fixed tuple for viem → @noble/hashes cross-check (see scripts/scratch-viem-keccak.ts). */
const CROSS_CHECK_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111",
);
const CROSS_CHECK_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
const CROSS_CHECK_RECIPIENT = new PublicKey(
  "7EqQdEUCbTQAJTLG87vcrMJv2aWKY8r8A7uf1u9d9xKz",
);
const CROSS_CHECK_EPOCH_ID = 20260613n;
const CROSS_CHECK_AMOUNT = 1_500_000n;
const CROSS_CHECK_VOUCHER_ID = Uint8Array.from(
  Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  ),
);
/** Pre-swap viem keccak256 digest for the tuple above. */
const VIEM_EXPECTED_DIGEST =
  "0x3e9c03fd9dad9df5d191ae7d1f44b33987ce862151c3c014500240c4ff1c7b17";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

function main() {
  const nobleHash = computeSolanaVoucherMessageHash({
    programId: CROSS_CHECK_PROGRAM_ID,
    mint: CROSS_CHECK_MINT,
    epochId: CROSS_CHECK_EPOCH_ID,
    recipientToken: CROSS_CHECK_RECIPIENT,
    amount: CROSS_CHECK_AMOUNT,
    voucherId: CROSS_CHECK_VOUCHER_ID,
  });
  const nobleHex = `0x${Buffer.from(nobleHash).toString("hex")}`;
  assert(
    nobleHex === VIEM_EXPECTED_DIGEST,
    `noble digest matches pre-swap viem (${nobleHex})`,
  );
  console.log("viem (pre-swap):", VIEM_EXPECTED_DIGEST);
  console.log("noble (current):", nobleHex);

  const programId = new PublicKey("11111111111111111111111111111111");
  const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const recipientToken = Keypair.generate().publicKey;
  const epochId = 20260613n;
  const amount = 1_500_000n;
  const voucherId = Keypair.generate().publicKey.toBytes();

  const hashA = computeSolanaVoucherMessageHash({
    programId,
    mint,
    epochId,
    recipientToken,
    amount,
    voucherId,
  });
  const hashB = computeSolanaVoucherMessageHash({
    programId,
    mint,
    epochId,
    recipientToken,
    amount,
    voucherId,
  });
  assert(hashA.length === 32, "hash is 32 bytes");
  assert(
    Buffer.from(hashA).equals(Buffer.from(hashB)),
    "hash is deterministic",
  );

  const keypair = Keypair.generate();
  const signature = signSolanaVoucherMessage(hashA, keypair.secretKey);
  assert(signature.length === 64, "signature is 64 bytes");

  const configPda = findConfigPda(programId);
  const vaultPda = findVaultPda(programId);
  const epochPda = findEpochPda(programId, epochId);
  const claimPda = findClaimMarkerPda(programId, voucherId);
  assert(PublicKey.isOnCurve(configPda) === false, "config PDA off-curve");
  assert(PublicKey.isOnCurve(vaultPda) === false, "vault PDA off-curve");
  assert(PublicKey.isOnCurve(epochPda) === false, "epoch PDA off-curve");
  assert(PublicKey.isOnCurve(claimPda) === false, "claim marker PDA off-curve");

  console.log("\nPDAs for placeholder program id:");
  console.log("  config:", configPda.toBase58());
  console.log("  vault:", vaultPda.toBase58());
  console.log("  epoch:", epochPda.toBase58());
  console.log("  claim:", claimPda.toBase58());
}

main();
