/**
 * Apply solana_claims migration when DATABASE_URL is set in .env.local.
 * Otherwise paste supabase/migrations/20260708130000_solana_claims.sql in Supabase SQL Editor.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL not set in .env.local");
    console.error(
      "Paste supabase/migrations/20260708130000_solana_claims.sql in Supabase Dashboard → SQL Editor instead.",
    );
    process.exit(1);
  }

  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260708130000_solana_claims.sql"),
    "utf8",
  );

  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("solana_claims migration applied.");
}

void main();
