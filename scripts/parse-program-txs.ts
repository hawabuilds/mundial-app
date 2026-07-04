import { Connection } from "@solana/web3.js";

async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const sigs = process.argv.slice(2);
  if (sigs.length === 0) {
    console.error("Usage: npx tsx scripts/parse-program-txs.ts <sig>...");
    process.exit(1);
  }
  for (const sig of sigs) {
    const tx = await conn.getTransaction(sig, {
      maxSupportedTransactionVersion: 0,
    });
    const logs =
      tx?.meta?.logMessages?.filter(
        (l) =>
          l.includes("Instruction:") ||
          l.toLowerCase().includes("epoch") ||
          l.toLowerCase().includes("claim") ||
          l.toLowerCase().includes("initialize"),
      ) ?? [];
    console.log("\n", sig);
    console.log(logs.join("\n") || "(no matching logs)");
  }
}

main().catch(console.error);
