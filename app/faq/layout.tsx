import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ | Mundial",
  description:
    "Search frequently asked questions about Mundial — how to play, points, payouts, and $SCORE.",
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
