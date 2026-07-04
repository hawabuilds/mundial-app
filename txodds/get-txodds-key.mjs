// TxLINE World Cup free-tier: subscribe on devnet + activate + fetch your API token.
// Run:  node txodds/get-txodds-key.mjs
//
// Devnet only offers Service Level 1 = World Cup + International Friendlies (60s delayed).
// This is free: you pay only tiny devnet gas (airdropped automatically).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import nacl from "tweetnacl";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Devnet config (from TxLINE docs) ----------
const RPC_URL = "https://api.devnet.solana.com";
const API_ORIGIN = "https://txline-dev.txodds.com"; // devnet API host
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const SERVICE_LEVEL_ID = 1; // World Cup + Int Friendlies, 60s delay (only free devnet tier)
const WEEKS = 4;            // subscribe in 4-week blocks
const SELECTED_LEAGUES = []; // [] = standard World Cup bundle

// ---------- Wallet ----------
// Reuses txodds/devnet-wallet.json if present, else creates one.
// To reuse your Solana Playground wallet instead: in Playground click the wallet
// -> export/save keypair, and paste its byte array into devnet-wallet.json.
const walletPath = path.join(__dirname, "devnet-wallet.json");
let kp;
if (fs.existsSync(walletPath)) {
  kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
} else {
  kp = Keypair.generate();
  fs.writeFileSync(walletPath, JSON.stringify(Array.from(kp.secretKey)));
  console.log("Created new devnet wallet at txodds/devnet-wallet.json");
}
console.log("Wallet:", kp.publicKey.toBase58());

const connection = new Connection(RPC_URL, "confirmed");

// ---------- Ensure a little devnet SOL for gas ----------
let balance = await connection.getBalance(kp.publicKey);
if (balance < 0.05 * LAMPORTS_PER_SOL) {
  console.log("Low balance, requesting a devnet airdrop...");
  try {
    const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  } catch {
    console.warn(
      "Airdrop was rate-limited. Fund this address at https://faucet.solana.com (devnet) then re-run."
    );
  }
  balance = await connection.getBalance(kp.publicKey);
}
console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL");

// ---------- Anchor program ----------
const wallet = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "txoracle-devnet.json"), "utf8"));
const program = new anchor.Program(idl, provider);

// ---------- PDAs + token accounts ----------
const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")],
  program.programId
);
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")],
  program.programId
);
const tokenTreasuryVault = getAssociatedTokenAddressSync(
  TXL_MINT,
  tokenTreasuryPda,
  true,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
);
const userTokenAccount = getAssociatedTokenAddressSync(
  TXL_MINT,
  kp.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
);

// Make sure the wallet's TXL token account exists (free tier = 0 balance, but the
// account still has to exist). Idempotent: safe to run repeatedly.
try {
  await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
} catch {
  console.log("Creating your TXL token account...");
  const ix = createAssociatedTokenAccountIdempotentInstruction(
    kp.publicKey,
    userTokenAccount,
    kp.publicKey,
    TXL_MINT,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await provider.sendAndConfirm(new Transaction().add(ix));
}

// ---------- Step 1: Subscribe on-chain ----------
console.log(`Subscribing: service level ${SERVICE_LEVEL_ID}, ${WEEKS} weeks...`);
const txSig = await program.methods
  .subscribe(SERVICE_LEVEL_ID, WEEKS)
  .accountsPartial({
    user: kp.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: TXL_MINT,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log("Subscription tx:", txSig);

// ---------- Step 2: Activate API access ----------
// Some TxLINE endpoints return plain text, others JSON. Parse defensively.
async function readTokenLike(res, label) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${text}`);
  try {
    const j = JSON.parse(text);
    return j.token || j.apiToken || j;
  } catch {
    return text.trim().replace(/^"|"$/g, "");
  }
}

// 2a. Guest JWT
const authRes = await fetch(`${API_ORIGIN}/auth/guest/start`, { method: "POST" });
const jwt = await readTokenLike(authRes, "guest/start");

// 2b. Sign the activation message: `${txSig}:${leagues}:${jwt}` (leagues empty here)
const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
const signatureBytes = nacl.sign.detached(new TextEncoder().encode(messageString), kp.secretKey);
const walletSignature = Buffer.from(signatureBytes).toString("base64");

// 2c. Activate
const actRes = await fetch(`${API_ORIGIN}/api/token/activate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
});
const apiToken = await readTokenLike(actRes, "token/activate");

fs.writeFileSync(
  path.join(__dirname, "api-token.txt"),
  typeof apiToken === "string" ? apiToken : JSON.stringify(apiToken)
);
console.log("\n=== API TOKEN (saved to txodds/api-token.txt) ===\n", apiToken, "\n");

// ---------- Step 3: Test call ----------
const fxRes = await fetch(`${API_ORIGIN}/api/fixtures/snapshot`, {
  headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
});
const fxText = await fxRes.text();
let fixtures;
try { fixtures = JSON.parse(fxText); } catch { fixtures = fxText; }
console.log(
  "Fixtures snapshot:",
  Array.isArray(fixtures) ? `${fixtures.length} fixtures returned` : fixtures
);
