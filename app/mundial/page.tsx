"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { markHasSignedInWithX } from "@/app/lib/auth-client";
import SolanaWalletProvider from "./providers/SolanaWalletProvider";
import type { TabId } from "./ui/TabBar";
import Call from "./screens/Call";
import Fixtures from "./screens/Fixtures";
import Landing from "./screens/Landing";
import Standings from "./screens/Standings";
import Vault from "./screens/Vault";

type Phase = "loading" | "landing" | TabId;

export default function MundialPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const { status } = useSession();

  useEffect(() => {
    if (status === "loading") {
      setPhase("loading");
      return;
    }

    if (status === "authenticated") {
      markHasSignedInWithX();
      setPhase((current) => (current === "loading" || current === "landing" ? "fixtures" : current));
      return;
    }

    setPhase("landing");
  }, [status]);

  return (
    <SolanaWalletProvider>
      <MundialContent phase={phase} setPhase={setPhase} />
    </SolanaWalletProvider>
  );
}

function MundialContent({
  phase,
  setPhase,
}: {
  phase: Phase;
  setPhase: (p: Phase | ((c: Phase) => Phase)) => void;
}) {
  if (phase === "loading") {
    return (
      <div className="m-app" style={{ minHeight: "100dvh", background: "#000" }} />
    );
  }

  if (phase === "landing") {
    return <Landing />;
  }

  const onTabChange = (tab: TabId) => setPhase(tab);
  const vaultDot = true;

  switch (phase) {
    case "standings":
      return <Standings onTabChange={onTabChange} vaultDot={vaultDot} />;
    case "call":
      return <Call onTabChange={onTabChange} vaultDot={vaultDot} />;
    case "vault":
      return <Vault onTabChange={onTabChange} />;
    case "fixtures":
    default:
      return <Fixtures onTabChange={onTabChange} vaultDot={vaultDot} />;
  }
}
