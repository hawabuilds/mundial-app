import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer | Mundial",
  description:
    "Legal disclaimer for Mundial — skill-based prediction game.",
};

export default function DisclaimerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
