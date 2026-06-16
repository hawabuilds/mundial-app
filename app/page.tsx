"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Claim from "./components/Claim";
import Dashboard from "./components/Dashboard";
import Landing from "./components/Landing";
import Leaderboard from "./components/Leaderboard";
import Wallet from "./components/Wallet";

import { markHasSignedInWithX } from "./lib/auth-client";

type Screen = "landing" | "dashboard" | "leaderboard" | "wallet" | "claim";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      markHasSignedInWithX();
      setScreen("dashboard");
    } else if (status === "unauthenticated") {
      setScreen("landing");
    }
  }, [status]);

  const goDashboard = () => setScreen("dashboard");
  const goLeaderboard = () => setScreen("leaderboard");
  const goWallet = () => setScreen("wallet");
  const goClaim = () => setScreen("claim");

  if (screen === "claim") {
    return (
      <Claim
        onGoToDashboard={goDashboard}
        onGoToLeaderboard={goLeaderboard}
        onGoToWallet={goWallet}
      />
    );
  }

  if (screen === "wallet") {
    return (
      <Wallet
        onGoToDashboard={goDashboard}
        onGoToLeaderboard={goLeaderboard}
        onGoToClaim={goClaim}
      />
    );
  }

  if (screen === "leaderboard") {
    return (
      <Leaderboard
        onGoToDashboard={goDashboard}
        onGoToWallet={goWallet}
        onGoToClaim={goClaim}
      />
    );
  }

  if (screen === "dashboard") {
    return (
      <Dashboard
        onGoToLeaderboard={goLeaderboard}
        onGoToWallet={goWallet}
        onGoToClaim={goClaim}
      />
    );
  }

  return <Landing />;
}
