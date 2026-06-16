import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs · Copa Mundial",
  description:
    "How Copa Mundial works — World Cup predictions on X, daily USDC prizes on Solana, funded by pump.fun creator fees.",
};

export default function MundialDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
