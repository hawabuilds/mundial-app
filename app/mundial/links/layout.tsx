import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Links · Copa Mundial",
  description: "Follow Copa Mundial on X, Discord, and more.",
};

export default function LinksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
