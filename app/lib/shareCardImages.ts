/** Fetch an image and return a data URL safe for html-to-image capture. */
export async function fetchImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { mode: "cors", credentials: "same-origin" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function avatarProxyAbsoluteUrl(profileImage: string): string {
  const path = `/api/avatar?url=${encodeURIComponent(profileImage)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function avatarUsernameProxyAbsoluteUrl(username: string): string {
  const handle = username.replace(/^@/, "").trim();
  const path = `/api/avatar?username=${encodeURIComponent(handle)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** Try X profile (proxied) then unavatar via API — embedded data URLs work in share captures. */
export async function resolveShareAvatarDataUrl(
  profileImage: string | null | undefined,
  username: string | null | undefined,
): Promise<string | null> {
  const candidates: string[] = [];
  if (profileImage?.trim()) {
    candidates.push(avatarProxyAbsoluteUrl(profileImage.trim()));
  }
  if (username?.trim()) {
    candidates.push(avatarUsernameProxyAbsoluteUrl(username));
  }

  for (const src of candidates) {
    const dataUrl = await fetchImageAsDataUrl(src);
    if (dataUrl) return dataUrl;
  }
  return null;
}
