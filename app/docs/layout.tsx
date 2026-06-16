import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs | Mundial",
  description:
    "Project documentation for Mundial — how to play, daily rewards, $SCORE token, and the rewards contract.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
