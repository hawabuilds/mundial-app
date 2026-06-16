import { Keypair } from "@solana/web3.js";
import { secretKeyToEnvJson } from "../lib/solanaKeypair";

function main() {
  const signer = Keypair.generate();
  const operator = Keypair.generate();

  console.log("Mundial Rewards — Solana payout keypairs (devnet/testing only)\n");
  console.log("Add these to .env.local (SERVER ONLY — never commit):\n");

  console.log("# Ed25519 voucher signer (must match initialize() signer arg)");
  console.log(`SOLANA_SIGNER_SECRET_KEY=${secretKeyToEnvJson(signer.secretKey)}`);
  console.log(`# Signer pubkey (32 bytes, for initialize): ${JSON.stringify(Array.from(signer.publicKey.toBytes()))}`);
  console.log(`# Signer base58: ${signer.publicKey.toBase58()}\n`);

  console.log("# Operator for open_epoch");
  console.log(`SOLANA_OPERATOR_SECRET_KEY=${secretKeyToEnvJson(operator.secretKey)}`);
  console.log(`# Operator pubkey (for initialize): ${operator.publicKey.toBase58()}\n`);

  console.log("# After anchor deploy + initialize, also set:");
  console.log("MUNDIAL_REWARDS_PROGRAM_ID=<deployed program id>");
  console.log("USDC_MINT=BjtWiAFKjrdvweA7Cer4MMWPRGNmpGGY9ixJwoZzfkFU  # devnet USDC");
  console.log("SOLANA_RPC_URL=https://api.devnet.solana.com");
  console.log("SOLANA_CLUSTER=devnet");
}

main();
