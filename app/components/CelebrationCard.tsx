"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { sessionUserIdentity } from "../lib/auth-client";
import {
  avatarProxyAbsoluteUrl,
  avatarUsernameProxyAbsoluteUrl,
} from "../lib/shareCardImages";
import styles from "./CelebrationCard.module.css";

export type ShareCardData = {
  tier: string;
  day: string;
  date: string;
  bnb: number;
  multi?: number;
  usdc?: number | null;
  network?: string;
};

const COPY = {
  ariaLabel: "Celebration",
  winner: "WINNER",
  prizeWon: "Prize won",
  paidOn: (network: string) => `paid on ${network}`,
  tagline: "mundial · predict & win daily",
  shareOnX: "Share on X",
  shareTweetText: "@copamundialapp",
  preparingImage: "Preparing image…",
  done: "Done",
  scoreBrand: "Copa Mundial",
  usdc: "USDC",
} as const;

function formatUsdcAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDayDate(day: string, date: string): string {
  return date ? `${day} · ${date}` : day;
}

function tierDisplayName(tier: string): string {
  switch (tier) {
    case "Tier 1":
    case "Tier 2":
    case "Tier 3":
      return tier;
    default:
      return tier;
  }
}

type ShareFallbackDetail = {
  imageCopied: boolean;
};

type CelebrationCardProps = {
  open: boolean;
  data: ShareCardData | null;
  onClose: () => void;
  onShareFallback?: (detail: ShareFallbackDetail) => void;
};

function XIcon() {
  return (
    <svg className={styles.xIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622z" />
    </svg>
  );
}

export default function CelebrationCard({
  open,
  data,
  onClose,
  onShareFallback,
}: CelebrationCardProps) {
  const { data: session, status } = useSession();
  const user = sessionUserIdentity(
    status,
    session?.user?.name,
    session?.user?.image,
    session?.user?.username,
  );
  const profileImage = session?.user?.image ?? null;
  const [mounted, setMounted] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setImageReady(false);
  }, [open, data]);

  const dayLabel = data ? formatDayDate(data.day, data.date) : "";

  const cardSrc = useMemo(() => {
    if (!data) return "";

    const avatar = profileImage?.trim()
      ? avatarProxyAbsoluteUrl(profileImage.trim())
      : user.username?.trim()
        ? avatarUsernameProxyAbsoluteUrl(user.username)
        : "";

    const amount =
      data.usdc != null ? formatUsdcAmount(data.usdc) : formatUsdcAmount(0);
    const unit = COPY.usdc;
    const sub = COPY.paidOn(data.network ?? "Solana");

    const params = new URLSearchParams({
      brand: COPY.scoreBrand,
      winner: COPY.winner,
      handle: user.handle,
      initials: user.initials,
      tier: tierDisplayName(data.tier),
      day: dayLabel,
      prize: COPY.prizeWon,
      amount,
      unit,
      sub,
      tag: COPY.tagline,
      avatar,
    });

    return `/api/share-card?${params.toString()}`;
  }, [
    data,
    dayLabel,
    profileImage,
    user.handle,
    user.initials,
    user.username,
  ]);

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const shareTweetText = COPY.shareTweetText;

  const openXIntent = () => {
    const url = new URL("https://twitter.com/intent/tweet");
    url.searchParams.set("text", shareTweetText);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  const copyImageToClipboard = async (blob: Blob): Promise<boolean> => {
    if (!navigator.clipboard?.write) return false;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  };

  const fetchCardBlob = async (): Promise<Blob | null> => {
    try {
      const res = await fetch(cardSrc, { cache: "force-cache" });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };

  const postToX = async () => {
    if (!cardSrc) return;
    setSharing(true);
    try {
      const blob = await fetchCardBlob();

      if (blob && typeof navigator.share === "function") {
        const file = new File([blob], "mundial-win.png", {
          type: "image/png",
        });
        const shareData = { text: shareTweetText, files: [file] };
        try {
          if (!navigator.canShare || navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return;
          }
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ text: shareTweetText, files: [file] });
            return;
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      const imageCopied = blob ? await copyImageToClipboard(blob) : false;
      openXIntent();
      onShareFallback?.({ imageCopied });
    } finally {
      setSharing(false);
    }
  };

  if (!open || !data || !mounted) return null;

  return createPortal(
    <div
      id="share-bg"
      className={`${styles.shareBg} ${styles.shareBgOpen}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={COPY.ariaLabel}
    >
      <div className={styles.shareModal}>
        <div className={styles.shareCardViewport}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.shareCardPreview}
            src={cardSrc}
            alt={COPY.ariaLabel}
            width={1600}
            height={900}
            onLoad={() => setImageReady(true)}
            onError={() => setImageReady(true)}
          />
          {!imageReady && (
            <div className={styles.shareCardLoading} aria-busy="true">
              {COPY.preparingImage}
            </div>
          )}
        </div>

        <div className={styles.shareActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGreen}`}
            onClick={postToX}
            disabled={sharing}
          >
            <XIcon />
            {sharing ? COPY.preparingImage : COPY.shareOnX}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onClose}
          >
            {COPY.done}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
