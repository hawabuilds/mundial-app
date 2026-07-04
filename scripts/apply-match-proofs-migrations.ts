/**
 * Apply match_proofs migrations (base + semantics) to Supabase.
 * Run: npx tsx scripts/apply-match-proofs-migrations.ts
 *
 * Uses .env.production.local then .env.local (same as migrate-txline-tables.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(name: string) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.production.local");
loadEnvFile(".env.local");

// Prefer whichever env file actually has Supabase admin creds.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  loadEnvFile(".env.local");
}

const migrations = [
  "20260704160000_match_proofs.sql",
  "20260704163000_match_proofs_semantics.sql",
];

async function applyViaPostgres(connectionString: string, sql: string) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  await client.end();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(
    /\/+$/,
    "",
  );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  for (const file of migrations) {
    const sqlPath = path.join(root, "supabase", "migrations", file);
    const sql = fs.readFileSync(sqlPath, "utf8");
    console.log(`Applying ${file}...`);
    if (dbUrl) {
      await applyViaPostgres(dbUrl, sql);
      console.log(`  OK (postgres)`);
    } else {
      const supabase = createClient(url, key);
      const { error } = await supabase.rpc("exec_sql", { query: sql });
      if (error) {
        console.error(`  FAILED: ${error.message}`);
        console.error(`  Paste ${sqlPath} into Supabase SQL Editor`);
        process.exit(1);
      }
      console.log(`  OK (exec_sql)`);
    }
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("information_schema.columns" as "match_proofs")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "match_proofs");

  if (error) {
    // information_schema not exposed via PostgREST — probe with a select
    const probe = await supabase.from("match_proofs").select("*").limit(0);
    if (probe.error?.message.includes("does not exist")) {
      console.error("match_proofs table still missing:", probe.error.message);
      process.exit(1);
    }
    console.log("match_proofs table exists (column probe via API limited)");
    console.log(
      "Confirm in Dashboard: semantics_mismatch, show_verified_badge, proof_mode, terminal_status_id",
    );
    return;
  }

  console.log("Columns:", data?.map((r) => (r as { column_name: string }).column_name).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
