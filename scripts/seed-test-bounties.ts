import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdminClient } from "../app/lib/supabase";

const TEST_PREFIX = "[TEST] ";
const IMAGE_BUCKET = "bounty-images";
const VIDEO_BUCKET = "bounty-videos";

function coverSvg(label: string, from: string, to: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#g)"/>
  <text x="400" y="240" font-family="Arial, sans-serif" font-size="44" font-weight="bold"
    fill="rgba(255,255,255,0.92)" text-anchor="middle">${label}</text>
</svg>`;
}

function submissionSvg(handle: string, accent: string): string {
  const label = handle.replace(/^@/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <rect width="800" height="450" fill="#0a0a0a"/>
  <rect x="40" y="40" width="720" height="370" rx="16" fill="#141414" stroke="${accent}" stroke-width="3"/>
  <circle cx="400" cy="175" r="48" fill="${accent}" opacity="0.25"/>
  <polygon points="385,155 385,195 425,175" fill="${accent}"/>
  <text x="400" y="280" font-family="Arial, sans-serif" font-size="36" font-weight="bold"
    fill="white" text-anchor="middle">${label}</text>
  <text x="400" y="320" font-family="Arial, sans-serif" font-size="18"
    fill="rgba(255,255,255,0.55)" text-anchor="middle">Example submission</text>
</svg>`;
}

async function uploadSvg(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  bucket: string,
  path: string,
  svg: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(svg), {
      contentType: "image/svg+xml",
      upsert: true,
    });
  if (error) throw new Error(`${bucket} upload failed (${path}): ${error.message}`);
}

async function clean() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounties")
    .delete()
    .like("title", `${TEST_PREFIX}%`)
    .select("id");

  if (error) throw new Error(error.message);
  console.log(`Removed ${data?.length ?? 0} test bounties (submissions cascade).`);
}

async function seed() {
  const supabase = getSupabaseAdminClient();
  const now = Date.now();

  // Bucket may not exist yet if schema.sql hasn't been re-run; create it here.
  await supabase.storage
    .createBucket(IMAGE_BUCKET, { public: true })
    .catch(() => undefined);
  await supabase.storage
    .createBucket(VIDEO_BUCKET, { public: true })
    .catch(() => undefined);

  await uploadSvg(
    supabase,
    IMAGE_BUCKET,
    "covers/test-celebration.svg",
    coverSvg("GOAL CELEBRATION", "#0a1628", "#0066FF"),
  );
  await uploadSvg(
    supabase,
    IMAGE_BUCKET,
    "covers/test-explainer.svg",
    coverSvg("30s EXPLAINER", "#101030", "#3b5bd4"),
  );
  await uploadSvg(
    supabase,
    IMAGE_BUCKET,
    "covers/test-stadium.svg",
    coverSvg("STADIUM VIBES", "#3d1010", "#d4683b"),
  );

  const rows = [
      {
        title: `${TEST_PREFIX}Best World Cup celebration video`,
        description:
          "Film your best goal celebration and post it with #Mundial. Most creative entry wins.\n\nRules:\n- 60 seconds max\n- Tag @copamundialapp in the post",
        image_path: "covers/test-celebration.svg",
        reward_wei: (25n * 10n ** 16n).toString(), // 0.25 BNB
        deadline_at: new Date(now + 3 * 86_400_000).toISOString(),
        created_by: "seed-script",
      },
      {
        title: `${TEST_PREFIX}Explain Mundial in 30 seconds`,
        description:
          "Record a short explainer of how to play and post it on any platform. Clearest video wins.",
        image_path: "covers/test-explainer.svg",
        reward_wei: (10n * 10n ** 16n).toString(), // 0.1 BNB
        deadline_at: new Date(now - 2 * 3_600_000).toISOString(),
        created_by: "seed-script",
      },
      {
        title: `${TEST_PREFIX}Stadium atmosphere clip`,
        description: "Show us match-day atmosphere in your city.",
        image_path: "covers/test-stadium.svg",
        reward_wei: (5n * 10n ** 16n).toString(), // 0.05 BNB
        deadline_at: new Date(now - 3 * 86_400_000).toISOString(),
        created_by: "seed-script",
      },
  ];

  let { data: bounties, error } = await supabase
    .from("bounties")
    .insert(rows)
    .select("id, title");

  if (error && /image_path/i.test(error.message)) {
    console.warn(
      "image_path column missing — seeding without covers.\n" +
        "Run in the Supabase SQL editor to enable cover images:\n" +
        "  alter table bounties add column if not exists image_path text;\n",
    );
    const withoutImages = rows.map(({ image_path: _ignored, ...rest }) => rest);
    ({ data: bounties, error } = await supabase
      .from("bounties")
      .insert(withoutImages)
      .select("id, title"));

    if (!error && bounties) {
      for (let i = 0; i < bounties.length; i++) {
        const { error: patchError } = await supabase
          .from("bounties")
          .update({ image_path: rows[i]!.image_path })
          .eq("id", bounties[i]!.id);
        if (patchError) break;
      }
    }
  }

  if (error) throw new Error(error.message);
  if (!bounties || bounties.length !== 3) throw new Error("Insert failed");

  const [, judging, paid] = bounties;

  const submissionSpecs = [
    {
      bountyId: judging.id,
      userId: "1000000000000000001",
      handle: "@testplayer1",
      accent: "#0066FF",
      postUrl: "https://x.com/mundialX/status/1",
    },
    {
      bountyId: judging.id,
      userId: "1000000000000000002",
      handle: "@testplayer2",
      accent: "#3b5bd4",
      postUrl: "https://x.com/mundialX/status/2",
    },
    {
      bountyId: paid.id,
      userId: "1000000000000000003",
      handle: "@testwinner",
      accent: "#d4683b",
      postUrl: "https://x.com/mundialX/status/3",
    },
  ] as const;

  for (const spec of submissionSpecs) {
    const mediaPath = `${spec.bountyId}/${spec.userId}.svg`;
    await uploadSvg(
      supabase,
      VIDEO_BUCKET,
      mediaPath,
      submissionSvg(spec.handle, spec.accent),
    );
  }

  const { data: submissions, error: subError } = await supabase
    .from("bounty_submissions")
    .insert(
      submissionSpecs.map((spec) => ({
        bounty_id: spec.bountyId,
        user_id: spec.userId,
        user_handle: spec.handle,
        video_path: `${spec.bountyId}/${spec.userId}.svg`,
        social_post_url: spec.postUrl,
      })),
    )
    .select("id, bounty_id, user_handle");

  if (subError) throw new Error(subError.message);

  const winner = submissions?.find((row) => row.bounty_id === paid.id);
  if (winner) {
    const { error: payError } = await supabase
      .from("bounties")
      .update({
        winner_submission_id: winner.id,
        winner_selected_at: new Date(now - 2 * 86_400_000).toISOString(),
        paid_tx_hash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        paid_at: new Date(now - 2 * 86_400_000 + 3_600_000).toISOString(),
      })
      .eq("id", paid.id);

    if (payError) throw new Error(payError.message);
  }

  console.log("Seeded 3 test bounties:");
  for (const bounty of bounties) console.log(`  ${bounty.id}  ${bounty.title}`);
  console.log(
    "\nStates: open (3d countdown) · judging (2 submissions, deadline passed) · paid (winner selected)",
  );
  console.log("Submission media uses uploaded SVG previews.");
  console.log("\nRemove later with: npx tsx scripts/seed-test-bounties.ts --clean");
}

const isClean = process.argv.includes("--clean");
(isClean ? clean() : seed()).catch((error) => {
  if (
    error instanceof Error &&
    /relation .* does not exist|Could not find the table/i.test(error.message)
  ) {
    console.error(
      "Bounty tables are missing — run the updated supabase/schema.sql in the Supabase SQL editor first.",
    );
  }
  if (error instanceof Error && /image_path/i.test(error.message)) {
    console.error(
      "Missing column — run in the Supabase SQL editor:\n" +
        "  alter table bounties add column if not exists image_path text;",
    );
  }
  console.error(error);
  process.exit(1);
});
