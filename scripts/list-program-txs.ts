import { config } from "dotenv";
config({ path: ".env.local" });

import { Connection, PublicKey } from "@solana/web3.js";
import { readSolanaPayoutConfig } from "../lib/solanaPayoutConfig";

async function main() {
  const cfg = readSolanaPayoutConfig();
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  console.log("program:", cfg.programId.toBase58());
  const sigs = await conn.getSignaturesForAddress(cfg.programId, { limit: 25 });
  for (const s of sigs) {
    console.log(s.err ? "FAIL" : "OK ", s.signature);
  }
}

main().catch(console.error);
