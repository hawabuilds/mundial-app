"use client";

import { getSupabaseClient } from "@/app/lib/supabase";

/** Must match BOUNTY_VIDEO_BUCKET / BOUNTY_IMAGE_BUCKET in app/lib/bounties.ts (server). */
const BOUNTY_VIDEO_BUCKET = "bounty-videos";
const BOUNTY_IMAGE_BUCKET = "bounty-images";

export type ApiBountySubmission = {
  id: string;
  userHandle: string;
  videoUrl: string;
  socialPostUrl: string;
  createdAt: string;
  isWinner: boolean;
  isMine: boolean;
};

export type ApiBounty = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  rewardWei: string;
  deadlineAt: string;
  winnerSelectedAt: string | null;
  paidTxHash: string | null;
  submissions: ApiBountySubmission[];
  myCanClaim: boolean;
};

export type BountyListResponse = {
  isAdmin: boolean;
  bounties: ApiBounty[];
};

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export async function fetchBounties(): Promise<BountyListResponse> {
  const response = await fetch("/api/bounty", { cache: "no-store" });
  return parseJsonOrThrow<BountyListResponse>(response);
}

export async function createBountyRequest(params: {
  title: string;
  description: string;
  imagePath: string;
  rewardBnb: number;
  deadlineAt: string;
}): Promise<{ id: string }> {
  const response = await fetch("/api/bounty", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow<{ id: string }>(response);
}

export async function uploadBountyVideo(
  bountyId: string,
  file: File,
  onProgress?: (label: "signing" | "uploading") => void,
): Promise<string> {
  onProgress?.("signing");
  const response = await fetch("/api/bounty/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bountyId, fileName: file.name }),
  });
  const upload = await parseJsonOrThrow<{ path: string; token: string }>(
    response,
  );

  onProgress?.("uploading");
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(BOUNTY_VIDEO_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || "video/mp4",
    });

  if (error) {
    throw new Error(error.message);
  }
  return upload.path;
}

/** Admin only: upload a bounty cover image, returns the storage path. */
export async function uploadBountyImage(file: File): Promise<string> {
  const response = await fetch("/api/bounty/image-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name }),
  });
  const upload = await parseJsonOrThrow<{ path: string; token: string }>(
    response,
  );

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(BOUNTY_IMAGE_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || "image/jpeg",
    });

  if (error) {
    throw new Error(error.message);
  }
  return upload.path;
}

export async function submitBountyEntry(params: {
  bountyId: string;
  videoPath: string;
  socialPostUrl: string;
}): Promise<{ id: string }> {
  const response = await fetch("/api/bounty/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow<{ id: string }>(response);
}

export async function selectBountyWinner(params: {
  bountyId: string;
  submissionId: string;
}): Promise<void> {
  const response = await fetch("/api/bounty/select-winner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  await parseJsonOrThrow<{ ok: boolean }>(response);
}

export async function claimBounty(
  bountyId: string,
): Promise<{ txHash?: string; alreadyClaimed?: boolean }> {
  const response = await fetch("/api/bounty/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bountyId }),
  });
  return parseJsonOrThrow<{ txHash?: string; alreadyClaimed?: boolean }>(
    response,
  );
}
