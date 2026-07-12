import { loadImage, type Image } from "@napi-rs/canvas";

/** Fetch X profile photo for canvas rendering (same source as /api/avatar). */
export async function fetchLeaderboardAvatar(
  handle: string,
): Promise<Image | null> {
  const username = handle.replace(/^@/, "").trim();
  if (!username || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return null;
  }

  try {
    const res = await fetch(
      `https://unavatar.io/twitter/${encodeURIComponent(username)}`,
      { headers: { "User-Agent": "mundial/1.0" } },
    );
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

export function avatarInitialsFromHandle(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean) return "?";
  return clean.slice(0, 2).toUpperCase();
}
