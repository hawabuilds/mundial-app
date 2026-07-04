/**
 * Apply TxLINE Supabase migrations.
 * Run: node scripts/migrate-txline-tables.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Optional: DATABASE_URL (direct Postgres) for DDL when exec_sql RPC is unavailable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(name) {
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

loadEnvFile(".env.local");
loadEnvFile(".env.production.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(
  /\/+$/,
  "",
);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

const sqlPath = path.join(root, "supabase", "migrations", "001_txline_tables.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error(`Paste ${sqlPath} into Supabase Dashboard → SQL Editor → Run.`);
  process.exit(1);
}

async function applyViaPostgres(connectionString) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Migration applied via DATABASE_URL.");
}

async function verifyTables() {
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const checks = ["match_goals", "match_odds"];
  for (const table of checks) {
    const { error } = await admin.from(table).select("*", { head: true, count: "exact" });
    console.log(error ? `✗ ${table}: ${error.message}` : `✓ ${table} exists`);
  }
  const { error: predErr } = await admin
    .from("predictions")
    .select("score_base", { head: true, count: "exact" });
  console.log(
    predErr?.message.includes("score_base")
      ? "✗ predictions.score_base — run migration SQL"
      : "✓ predictions.score_base column",
  );
}

try {
  if (dbUrl) {
    await applyViaPostgres(dbUrl);
  } else {
    console.log(`
No DATABASE_URL set — cannot run DDL via REST API.

Open Supabase Dashboard → SQL Editor and run:
  supabase/migrations/001_txline_tables.sql

Then re-run this script to verify tables.
`);
  }
  await verifyTables();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  console.error(`\nFallback: paste ${sqlPath} into Supabase SQL Editor.`);
  process.exit(1);
}
