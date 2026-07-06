import fs from "node:fs";
import path from "node:path";
import { isCollectAuthorized } from "@/lib/cronAuth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MIGRATION_FILES = [
  "20260704160000_match_proofs.sql",
  "20260704163000_match_proofs_semantics.sql",
  "20260704170000_match_proofs_dual.sql",
] as const;

async function applyViaPostgres(connectionString: string, sql: string): Promise<void> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function POST(request: NextRequest) {
  if (!isCollectAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    null;

  if (!dbUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "DATABASE_URL or SUPABASE_DB_URL not configured on server",
        migrations: MIGRATION_FILES,
      },
      { status: 503 },
    );
  }

  const applied: string[] = [];
  try {
    for (const migration of MIGRATION_FILES) {
      const sqlPath = path.join(process.cwd(), "supabase", "migrations", migration);
      const sql = fs.readFileSync(sqlPath, "utf8");
      await applyViaPostgres(dbUrl, sql);
      applied.push(migration);
    }
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message, applied, pending: MIGRATION_FILES.slice(applied.length) },
      { status: 500 },
    );
  }
}
