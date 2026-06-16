"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClaimableRewardDto } from "@/app/lib/listUserClaimableRewards";
import { fetchClaimableRewards } from "@/app/lib/claimable-rewards-client";
import {
  readPublicSolanaCluster,
  solanaExplorerClusterParam,
} from "@/lib/solanaPublicConfig";
import {
  fetchLinkedPayoutWallet,
  useLinkSolanaPayoutWallet,
} from "../lib/useLinkSolanaWallet";
import { useSolanaClaim } from "../lib/useSolanaClaim";
import {
  shortenSolanaAddress,
  useSolanaWallet,
} from "../lib/solana-wallet";
import { useWalletModal } from "../providers/wallet-modal-context";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { AppShell } from "../ui/TabBar";
import type { TabId } from "../ui/TabBar";
import CelebrationCard, {
  type ShareCardData,
} from "@/app/components/CelebrationCard";
import styles from "./Vault.module.css";

const USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT?.trim() ??
  "BjtWiAFKjrdvweA7Cer4MMWPRGNmpGGY9ixJwoZzfkFU";

const SOLANA_CLUSTER = readPublicSolanaCluster();

type Props = {
  onTabChange: (t: TabId) => void;
};

function formatPrizeShare(reward: ClaimableRewardDto): string {
  return reward.prizeLabel;
}

export default function Vault({ onTabChange }: Props) {
  const { address, balanceSol, connecting, isConnected, disconnect } =
    useSolanaWallet();
  const { open: openWalletModal } = useWalletModal();
  const { linkStatus, linkError, retryLink } = useLinkSolanaPayoutWallet();
  const {
    claimEpoch,
    claimingEpochId,
    claimError,
    lastSignature,
    clearClaimError,
  } = useSolanaClaim(USDC_MINT);

  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(true);
  const [rewards, setRewards] = useState<ClaimableRewardDto[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [rewardsError, setRewardsError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<ShareCardData | null>(null);

  const reloadRewards = useCallback(async () => {
    setRewardsLoading(true);
    setRewardsError(null);
    try {
      const data = await fetchClaimableRewards();
      setRewards(data);
    } catch (error) {
      setRewards([]);
      setRewardsError(
        error instanceof Error ? error.message : "Could not load rewards",
      );
    } finally {
      setRewardsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLinkedLoading(true);
    void fetchLinkedPayoutWallet()
      .then((wallet) => {
        if (!cancelled) setLinkedWallet(wallet);
      })
      .catch(() => {
        if (!cancelled) setLinkedWallet(null);
      })
      .finally(() => {
        if (!cancelled) setLinkedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkStatus]);

  useEffect(() => {
    void reloadRewards();
  }, [reloadRewards, lastSignature]);

  const open = useMemo(
    () => rewards.filter((reward) => !reward.claimed),
    [rewards],
  );
  const done = useMemo(
    () => rewards.filter((reward) => reward.claimed),
    [rewards],
  );

  const statusLabel = (() => {
    if (connecting) return "Connecting…";
    if (linkStatus === "linking") return "Saving payout address…";
    if (linkStatus === "linked") return "Payout wallet linked";
    if (linkStatus === "error") return "Link failed";
    if (isConnected && linkedWallet && address === linkedWallet) {
      return "Connected & linked";
    }
    if (isConnected) return "Connected";
    return "Not connected";
  })();

  const displayAddress = address ?? linkedWallet ?? null;

  const handleClaim = async (reward: ClaimableRewardDto) => {
    clearClaimError();
    try {
      await claimEpoch(reward.epochId);
      setCelebration({
        tier: reward.tier,
        day: reward.day,
        date: reward.date,
        bnb: 0,
        usdc: reward.usdc ?? Number(reward.amountWei) / 1_000_000,
        network: SOLANA_CLUSTER === "devnet" ? "Solana Devnet" : "Solana",
      });
      await reloadRewards();
    } catch {
      // claimError state is set in hook
    }
  };

  return (
    <AppShell tab="vault" onTabChange={onTabChange}>
      <section className={styles.walletSection}>
        <div className={styles.walletIntro}>
          <h2 className="m-headline">Wallet</h2>
          <p className={styles.sub}>
            Connect once to receive tournament payouts in USDC. Predictions stay
            on X.
          </p>
        </div>

        <div className={styles.walletActions}>
          {isConnected && address ? (
            <>
              <p className={styles.connectedAddress} title={address}>
                {shortenSolanaAddress(address)}
              </p>
              <Button
                fullWidth
                variant="soft"
                onClick={() => void disconnect()}
              >
                Disconnect
              </Button>
              {linkStatus === "error" ? (
                <Button fullWidth variant="soft" onClick={retryLink}>
                  Retry saving payout address
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              fullWidth
              disabled={connecting}
              onClick={openWalletModal}
            >
              {connecting ? "Connecting…" : "Connect Wallet"}
            </Button>
          )}
        </div>

        {linkError ? (
          <p className={styles.error} role="alert">
            {linkError}
          </p>
        ) : null}

        {linkStatus === "linked" ? (
          <p className={styles.success}>Payout address saved to your account.</p>
        ) : null}

        {claimError ? (
          <p className={styles.error} role="alert">
            {claimError}
          </p>
        ) : null}

        {lastSignature ? (
          <p className={styles.success}>
            Claim submitted.{" "}
            <a
              className={styles.link}
              href={`https://explorer.solana.com/tx/${lastSignature}${solanaExplorerClusterParam(SOLANA_CLUSTER)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View transaction
            </a>
          </p>
        ) : null}

        <Card className={styles.status}>
          <dl className={styles.statusList}>
            <div className={styles.statusRow}>
              <dt className={styles.key}>Network</dt>
              <dd className={styles.val}>
                Solana {SOLANA_CLUSTER === "devnet" ? "Devnet" : "Mainnet"}
              </dd>
            </div>
            <div className={styles.statusRow}>
              <dt className={styles.key}>Status</dt>
              <dd
                className={
                  isConnected || linkStatus === "linked"
                    ? styles.valAccent
                    : styles.valMuted
                }
              >
                {statusLabel}
              </dd>
            </div>
            {displayAddress ? (
              <div className={styles.statusRow}>
                <dt className={styles.key}>Address</dt>
                <dd className={styles.valMono} title={displayAddress}>
                  {linkedLoading && !address
                    ? "…"
                    : shortenSolanaAddress(displayAddress)}
                </dd>
              </div>
            ) : null}
            {balanceSol != null ? (
              <div className={styles.statusRow}>
                <dt className={styles.key}>Balance</dt>
                <dd className={styles.val}>
                  {balanceSol.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}{" "}
                  SOL
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </section>

      {rewardsLoading ? (
        <p className={styles.hint}>Loading your rewards…</p>
      ) : null}

      {rewardsError ? (
        <p className={styles.error} role="alert">
          {rewardsError}
        </p>
      ) : null}

      {!rewardsLoading && !rewardsError && open.length > 0 ? (
        <section className={styles.block}>
          <p className="m-label">Ready to collect</p>
          <div className={styles.payoutList}>
            {open.map((reward) => (
              <Card key={reward.id} glow className={styles.payout}>
                <div className={styles.payoutMain}>
                  <p className={styles.payoutDate}>{reward.date}</p>
                  <p className={styles.payoutMeta}>
                    {reward.tier} · Rank #{reward.rank}
                  </p>
                </div>
                <div className={styles.payoutAside}>
                  <p className={styles.payoutSol}>
                    {formatPrizeShare(reward)}
                  </p>
                  <Button
                    variant="soft"
                    disabled={
                      !isConnected ||
                      claimingEpochId === reward.epochId ||
                      linkStatus === "linking"
                    }
                    onClick={() => void handleClaim(reward)}
                  >
                    {claimingEpochId === reward.epochId
                      ? "Collecting…"
                      : "Collect"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {!rewardsLoading && !rewardsError && open.length === 0 && rewards.length === 0 ? (
        <p className={styles.hint}>
          No finalized rewards yet. Finish in the top 20 on a scored day to
          appear here.
        </p>
      ) : null}

      {done.length > 0 ? (
        <section className={styles.block}>
          <p className="m-label">Collected</p>
          <div className={styles.payoutList}>
            {done.map((reward) => (
              <Card key={reward.id} className={styles.payoutDone}>
                <div className={styles.payoutMain}>
                  <p className={styles.payoutDate}>{reward.date}</p>
                  <p className={styles.payoutMeta}>
                    {reward.tier} · Rank #{reward.rank}
                  </p>
                </div>
                <p className={styles.payoutSolMuted}>
                  {formatPrizeShare(reward)}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <CelebrationCard
        open={celebration != null}
        data={celebration}
        onClose={() => setCelebration(null)}
      />
    </AppShell>
  );
}
