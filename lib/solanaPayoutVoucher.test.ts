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

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${message}`);
  }
}

function main() {
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
