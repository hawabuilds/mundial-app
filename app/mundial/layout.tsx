import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./styles/base.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-syne",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Mundial",
  description: "Call the score. Own the table. Global tournament predictions on X.",
};

export default function MundialLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`m-app ${syne.variable} ${inter.variable}`}>{children}</div>
  );
}
