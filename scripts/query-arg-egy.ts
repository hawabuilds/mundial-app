import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "../app/lib/supabase";

async function main() {
  const c = getSupabaseAdminClient();
  const id = Number(process.argv[2] ?? 80);

  for (const table of ["match_state", "match_proofs", "match_odds", "match_goals"] as const) {
    const { data, error } = await c.from(table).select("*").eq("match_id", id);
    console.log(`\n=== ${table} match_id=${id} ===`);
    if (error) console.log("ERROR", error.message);
    else console.log(JSON.stringify(data, null, 2));
  }
}

void main();
