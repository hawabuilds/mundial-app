import { config } from "dotenv";
config({ path: ".env.local" });

async function xGet(path: string) {
  const raw = process.env.X_BEARER_TOKEN ?? "";
  const response = await fetch(`https://api.twitter.com/2${path}`, {
    headers: {
      Authorization: `Bearer ${raw}`,
      "User-Agent": "mundial/1.0",
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  for (const handle of ["MundialX", "mundialX", "mundialx"]) {
    const user = await xGet(`/users/by/username/${handle}`);
    console.log(`\nUser @${handle}:`, user.status, JSON.stringify(user.body, null, 2));
  }

  for (const query of [
    "from:MundialX",
    "from:mundialX",
    "MundialX",
    "Spain Cape Verde",
    "World Cup predict",
  ]) {
    const encoded = encodeURIComponent(query);
    const res = await xGet(
      `/tweets/search/recent?query=${encoded}&max_results=10&tweet.fields=created_at,author_id,text&expansions=author_id&user.fields=username`,
    );
    const count = res.body?.meta?.result_count ?? res.body?.data?.length ?? 0;
    console.log(`\nSearch "${query}": status=${res.status} count=${count}`);
    if (res.body?.data?.length) {
      for (const t of res.body.data.slice(0, 3)) {
        const author = res.body.includes?.users?.find((u: { id: string }) => u.id === t.author_id);
        console.log(`  ${t.id} @${author?.username} ${t.created_at} ${t.text.slice(0, 100)}`);
      }
    }
    if (res.body?.errors) console.log("  errors:", res.body.errors);
  }
}

main().catch(console.error);
