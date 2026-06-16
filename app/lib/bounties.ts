import { getSupabaseAdminClient } from "@/app/lib/supabase";

export const BOUNTY_VIDEO_BUCKET = "bounty-videos";
export const BOUNTY_IMAGE_BUCKET = "bounty-images";

export type BountyRow = {
  id: string;
  title: string;
  description: string;
  image_path: string | null;
  reward_wei: string;
  deadline_at: string;
  winner_submission_id: string | null;
  winner_selected_at: string | null;
  claim_started_at: string | null;
  paid_tx_hash: string | null;
  paid_at: string | null;
  created_by: string;
  created_at: string;
};

export type BountySubmissionRow = {
  id: string;
  bounty_id: string;
  user_id: string;
  user_handle: string;
  video_path: string;
  social_post_url: string;
  created_at: string;
};

export async function listBounties(): Promise<BountyRow[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounties")
    .select("*")
    .order("deadline_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BountyRow[];
}

export async function getBounty(bountyId: string): Promise<BountyRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounties")
    .select("*")
    .eq("id", bountyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BountyRow | null) ?? null;
}

export async function createBounty(params: {
  title: string;
  description: string;
  imagePath: string;
  rewardWei: bigint;
  deadlineAt: Date;
  createdBy: string;
}): Promise<BountyRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounties")
    .insert({
      title: params.title,
      description: params.description,
      image_path: params.imagePath,
      reward_wei: params.rewardWei.toString(),
      deadline_at: params.deadlineAt.toISOString(),
      created_by: params.createdBy,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as BountyRow;
}

export async function listSubmissions(
  bountyId?: string,
): Promise<BountySubmissionRow[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("bounty_submissions")
    .select("*")
    .order("created_at", { ascending: true });

  if (bountyId) query = query.eq("bounty_id", bountyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as BountySubmissionRow[];
}

export async function getSubmission(
  submissionId: string,
): Promise<BountySubmissionRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounty_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as BountySubmissionRow | null) ?? null;
}

export async function upsertSubmission(params: {
  bountyId: string;
  userId: string;
  userHandle: string;
  videoPath: string;
  socialPostUrl: string;
}): Promise<BountySubmissionRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounty_submissions")
    .upsert(
      {
        bounty_id: params.bountyId,
        user_id: params.userId,
        user_handle: params.userHandle,
        video_path: params.videoPath,
        social_post_url: params.socialPostUrl,
      },
      { onConflict: "bounty_id,user_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as BountySubmissionRow;
}

export async function setBountyWinner(
  bountyId: string,
  submissionId: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("bounties")
    .update({
      winner_submission_id: submissionId,
      winner_selected_at: new Date().toISOString(),
    })
    .eq("id", bountyId)
    .is("paid_tx_hash", null);

  if (error) throw new Error(error.message);
}

/**
 * Claim lock: only one claim attempt may be in flight. Returns false when
 * another request already holds the lock (started < lockTimeoutMs ago) or
 * the bounty is already paid.
 */
export async function tryStartBountyClaim(
  bountyId: string,
  lockTimeoutMs = 2 * 60_000,
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - lockTimeoutMs).toISOString();

  const { data, error } = await supabase
    .from("bounties")
    .update({ claim_started_at: new Date().toISOString() })
    .eq("id", bountyId)
    .is("paid_tx_hash", null)
    .or(`claim_started_at.is.null,claim_started_at.lt.${cutoff}`)
    .select("id");

  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function clearBountyClaimLock(bountyId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase
    .from("bounties")
    .update({ claim_started_at: null })
    .eq("id", bountyId)
    .is("paid_tx_hash", null);
}

export async function markBountyPaid(
  bountyId: string,
  txHash: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("bounties")
    .update({
      paid_tx_hash: txHash,
      paid_at: new Date().toISOString(),
    })
    .eq("id", bountyId);

  if (error) throw new Error(error.message);
}

export function bountyVideoPublicUrl(videoPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BOUNTY_VIDEO_BUCKET}/${videoPath}`;
}

export function bountyImagePublicUrl(imagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BOUNTY_IMAGE_BUCKET}/${imagePath}`;
}

export async function createVideoUploadUrl(
  videoPath: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(BOUNTY_VIDEO_BUCKET)
    .createSignedUploadUrl(videoPath, { upsert: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function createImageUploadUrl(
  imagePath: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(BOUNTY_IMAGE_BUCKET)
    .createSignedUploadUrl(imagePath, { upsert: true });

  if (error) throw new Error(error.message);
  return data;
}

export function isBountyOpen(bounty: BountyRow, now: Date = new Date()): boolean {
  return (
    new Date(bounty.deadline_at).getTime() > now.getTime() &&
    !bounty.winner_submission_id
  );
}
