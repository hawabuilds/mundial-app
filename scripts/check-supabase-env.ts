import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeSupabaseUrl } from "../app/lib/supabase";

async function main() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const res = await fetch(`${url}/rest/v1/match_goals?fixture_id=eq.18202701&select=minute,side,player&limit=5`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  console.log("HTTP", res.status, res.statusText);
  const text = await res.text();
  console.log(text.slice(0, 500));
}

main().catch(console.error);
