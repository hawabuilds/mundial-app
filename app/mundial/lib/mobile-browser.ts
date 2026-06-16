type SolanaWindow = Window & {
  phantom?: { solana?: { isPhantom?: boolean } };
  solana?: { isPhantom?: boolean; isSolflare?: boolean };
  backpack?: unknown;
};

/** True on phones/tablets where extension wallets are unavailable. */
export function isMobileDevice(userAgent?: string): boolean {
  const ua = resolveUserAgent(userAgent);
  if (!ua) return false;
  return /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
}

function resolveUserAgent(userAgent?: string): string {
  if (userAgent) return userAgent;
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

/** Phantom, Solflare, Backpack, etc. ship a full browser with wallet injection. */
export function isWalletInAppBrowser(userAgent?: string): boolean {
  const ua = resolveUserAgent(userAgent);
  if (!ua) return false;
  if (/Phantom/i.test(ua)) return true;
  if (/Solflare/i.test(ua)) return true;
  if (/Backpack/i.test(ua)) return true;
  return false;
}

/** Wallet provider already injected — safe to connect even on iOS WebViews. */
export function hasInjectedSolanaWallet(win?: SolanaWindow | null): boolean {
  const w =
    win ?? (typeof window !== "undefined" ? (window as SolanaWindow) : null);
  if (!w) return false;
  if (w.phantom?.solana) return true;
  const solana = w.solana as
    | (SolanaWindow["solana"] & { connect?: () => Promise<unknown> })
    | undefined;
  if (solana?.isPhantom || solana?.isSolflare) return true;
  if (typeof solana?.connect === "function" && (solana.isPhantom || w.phantom)) {
    return true;
  }
  if (w.backpack) return true;
  return false;
}

export function isWalletCapableBrowser(
  userAgent?: string,
  win?: SolanaWindow | null,
): boolean {
  return isWalletInAppBrowser(userAgent) || hasInjectedSolanaWallet(win);
}

/**
 * In-app browsers (X/Twitter, Instagram, etc.) block wallet injection and
 * deep-link handoff — connection will not work until the user opens Safari or
 * a wallet app's browser.
 */
export function isInAppBrowser(userAgent?: string): boolean {
  const ua = resolveUserAgent(userAgent);
  if (!ua) return false;

  if (isWalletCapableBrowser(ua)) return false;

  if (/Twitter/i.test(ua)) return true;
  if (/FBAN|FBAV/i.test(ua)) return true;
  if (/Instagram/i.test(ua)) return true;
  if (/LinkedInApp/i.test(ua)) return true;
  if (/Line\//i.test(ua)) return true;

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua)) return true;

  return false;
}

export function walletConnectionBlocked(
  userAgent?: string,
  win?: SolanaWindow | null,
): boolean {
  if (isWalletCapableBrowser(userAgent, win)) return false;
  return isInAppBrowser(userAgent);
}

/** Opens the current page inside Phantom's in-app browser (provider injected there). */
export function buildPhantomBrowseUrl(pageUrl: string): string {
  const ref =
    typeof window !== "undefined" ? window.location.origin : pageUrl;
  return `https://phantom.app/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(ref)}`;
}

export function openInPhantomBrowser(pageUrl?: string): void {
  const target = pageUrl ?? window.location.href;
  window.location.href = buildPhantomBrowseUrl(target);
}

export async function copyPageUrl(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}
