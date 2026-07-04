"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Figtree } from "next/font/google";
import { LAND_LOGO_SRC } from "./landing-assets/logo";
import {
  SOCIAL_TELEGRAM_URL,
  SOCIAL_X_URL,
} from "../lib/socialLinks";

const SECTION_IDS = [
  "overview",
  "how-to-play",
  "rewards",
  "token",
  "contract",
  "webapp",
  "community",
  "links",
  "disclaimer",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-figtree",
});

function DocsLogo({ className }: { className: string }) {
  const tc = useTranslations("common");

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LAND_LOGO_SRC}
      alt={tc("scoreLogoAlt")}
      className={`select-none object-contain ${className}`}
    />
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold tracking-[0.25em] uppercase text-blue-500 mb-3">
      {children}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-6">
      {children}
    </h2>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-blue-900/60 bg-gradient-to-b from-blue-950/40 to-zinc-950/40 p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-l-4 border-blue-500 bg-blue-500/10 px-6 py-4 text-blue-100/90 leading-relaxed">
      {children}
    </div>
  );
}

function BrandName() {
  const t = useTranslations("docs");

  return (
    <span className="font-extrabold tracking-tight text-white">
      {t("brandName")}
      <span className="text-blue-500">.</span>
    </span>
  );
}

export default function DocsContent() {
  const t = useTranslations("docs");
  const [active, setActive] = useState<SectionId>("overview");
  const observer = useRef<IntersectionObserver | null>(null);

  const sections = useMemo(
    () =>
      SECTION_IDS.map((id) => ({
        id,
        label: t(`nav.${id}`),
      })),
    [t],
  );

  const rich = {
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    strong: (chunks: React.ReactNode) => (
      <strong className="text-white">{chunks}</strong>
    ),
    mono: (chunks: React.ReactNode) => (
      <span className="font-mono text-blue-300 text-sm">{chunks}</span>
    ),
    xHandle: (chunks: React.ReactNode) => (
      <span className="text-blue-300 font-semibold">{chunks}</span>
    ),
    site: (chunks: React.ReactNode) => (
      <span className="text-blue-300 font-semibold">{chunks}</span>
    ),
    highlight: (chunks: React.ReactNode) => (
      <strong className="text-blue-300">{chunks}</strong>
    ),
  };

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActive(visible[0].target.id as SectionId);
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.current?.observe(el);
    });

    return () => observer.current?.disconnect();
  }, []);

  const jump = (id: SectionId) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scoringCards = [
    { key: "exact" as const, pts: "5" },
    { key: "outcome" as const, pts: "3" },
    { key: "wrong" as const, pts: "1" },
  ];

  const rewardTiers = ["tier1", "tier2", "tier3"] as const;
  const rewardWidths = ["w-[28%]", "w-[39%]", "w-[33%]"] as const;

  const tokenTaxCards = ["buyback", "payouts", "development"] as const;

  const claimSteps = ["verify", "authorise", "claim"] as const;

  const safetyRules = ["rule1", "rule2", "rule3", "rule4", "rule5", "rule6"] as const;

  const webappFeatures = ["fixtures", "leaderboard", "signIn", "wallet"] as const;

  const communityEarn = ["quizzes", "activeMember", "bounty"] as const;

  const officialLinks = [
    {
      key: "webapp" as const,
      href: "https://mundial.xyz",
      external: true,
    },
    {
      key: "x" as const,
      href: SOCIAL_X_URL,
      external: true,
    },
    {
      key: "telegram" as const,
      href: SOCIAL_TELEGRAM_URL,
      external: true,
    },
    {
      key: "disclaimer" as const,
      href: "/disclaimer",
      external: false,
    },
  ];

  return (
    <div
      className={`${figtree.variable} min-h-screen bg-[#050508] text-zinc-200 antialiased`}
      style={{
        fontFamily: 'var(--font-figtree), "Figtree", sans-serif',
        background:
          "radial-gradient(ellipse 100% 60% at 70% -10%, rgba(0, 102, 255, 0.16), transparent 50%), #050508",
      }}
    >
      <nav className="lg:hidden sticky top-0 z-40 backdrop-blur-md bg-zinc-950/60 border-b border-blue-900/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <DocsLogo className="h-8 w-auto" />
          <BrandName />
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                active === s.id
                  ? "bg-blue-500 text-black border-blue-500"
                  : "border-blue-900/70 text-blue-200/70 hover:border-blue-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[260px_1fr] lg:gap-12 px-4 sm:px-6 lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-8 py-10">
            <DocsLogo className="h-16 w-auto mb-4" />
            <p className="font-extrabold tracking-tight text-white text-lg leading-tight">
              <BrandName />
            </p>
            <p className="text-xs text-blue-200/50 mt-1 mb-8">
              {t("sidebarTagline")}
            </p>
            <ul className="space-y-0.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jump(s.id)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                      active === s.id
                        ? "bg-blue-500/15 text-blue-300 font-semibold"
                        : "text-neutral-400 hover:text-blue-200 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${
                        active === s.id
                          ? "bg-blue-400"
                          : "bg-blue-900 group-hover:bg-blue-700"
                      }`}
                    />
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-10 border-t border-blue-900/50 pt-5 text-xs text-blue-200/40 leading-relaxed">
              mundial.xyz
              <br />
              @copamundialapp · BNB Chain
            </div>
          </div>
        </aside>

        <main className="pb-24">
          <header className="pt-8 sm:pt-12 pb-16">
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-700/60 px-3 py-1 text-xs font-semibold text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                {t("hero.live")}
              </span>
              <span className="rounded-full border border-blue-900/70 px-3 py-1 text-xs font-semibold text-blue-200/60">
                {t("hero.chain")}
              </span>
              <span className="rounded-full border border-blue-900/70 px-3 py-1 text-xs font-semibold text-blue-200/60">
                {t("hero.launchpad")}
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
              {t("hero.title1")}
              <br />
              <span className="text-blue-400">{t("hero.title2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-neutral-300 leading-relaxed">
              {t("hero.subtitle")}
            </p>
          </header>

          <section id="overview" className="scroll-mt-24 py-10">
            <Eyebrow>{t("overview.eyebrow")}</Eyebrow>
            <SectionTitle>{t("overview.title")}</SectionTitle>
            <p className="max-w-2xl leading-relaxed text-neutral-300">
              {t.rich("overview.p1", rich)}
            </p>
            <p className="mt-4 max-w-2xl leading-relaxed text-neutral-300">
              {t.rich("overview.p2", rich)}
            </p>
          </section>

          <section id="how-to-play" className="scroll-mt-24 py-10">
            <Eyebrow>{t("howToPlay.eyebrow")}</Eyebrow>
            <SectionTitle>{t("howToPlay.title")}</SectionTitle>

            <ol className="space-y-3 max-w-2xl">
              {(["step1", "step2", "step3", "step4", "step5", "step6"] as const).map(
                (stepKey, i) => (
                  <li key={stepKey} className="flex gap-4 items-start">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-700 text-blue-300 text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed text-neutral-300">
                      {t.rich(`howToPlay.${stepKey}`, rich)}
                    </span>
                  </li>
                ),
              )}
            </ol>

            <h3 className="mt-12 mb-5 text-xl font-bold text-white">
              {t("howToPlay.scoringTitle")}
            </h3>
            <div className="grid sm:grid-cols-3 gap-4 max-w-3xl">
              {scoringCards.map((s) => (
                <Card key={s.key} className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-blue-500 bg-zinc-950/50 text-2xl font-extrabold text-blue-400">
                    {s.pts}
                  </div>
                  <p className="mt-3 font-semibold text-white">
                    {t(`howToPlay.scoring.${s.key}.label`)}
                  </p>
                  <p className="text-sm text-neutral-400">
                    {t(`howToPlay.scoring.${s.key}.note`)}
                  </p>
                </Card>
              ))}
            </div>
            <p className="mt-4 text-sm text-neutral-500 max-w-2xl">
              {t("howToPlay.scoringNote")}
            </p>
            <p className="mt-2 text-sm text-neutral-400 max-w-2xl">
              {t("howToPlay.scoringMarket")}
            </p>

            <h3 className="mt-12 mb-4 text-xl font-bold text-white">
              {t("howToPlay.formatTitle")}
            </h3>
            <ul className="space-y-2.5 max-w-2xl">
              {(["format1", "format2", "format3"] as const).map((key) => (
                <li
                  key={key}
                  className="flex gap-3 items-start text-neutral-300 leading-relaxed"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{t.rich(`howToPlay.${key}`, rich)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="rewards" className="scroll-mt-24 py-10">
            <Eyebrow>{t("rewards.eyebrow")}</Eyebrow>
            <SectionTitle>{t("rewards.title")}</SectionTitle>

            <div className="max-w-3xl space-y-3">
              {rewardTiers.map((tier, i) => (
                <Card key={tier} className="!p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold text-white">
                      {t(`rewards.${tier}.ranks`)}
                    </span>
                    <span className="text-blue-300 font-semibold">
                      {t(`rewards.${tier}.share`)}
                    </span>
                    <span className="text-sm text-neutral-400">
                      {t(`rewards.${tier}.each`)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-blue-950">
                    <div
                      className={`h-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 ${rewardWidths[i]}`}
                    />
                  </div>
                </Card>
              ))}
            </div>

            <p className="mt-6 max-w-2xl leading-relaxed text-neutral-300">
              {t("rewards.note")}
            </p>
          </section>

          <section id="token" className="scroll-mt-24 py-10">
            <Eyebrow>{t("token.eyebrow")}</Eyebrow>
            <SectionTitle>{t("token.title")}</SectionTitle>

            <Card className="max-w-3xl !p-0 overflow-hidden">
              <dl className="divide-y divide-blue-900/50">
                {(["chain", "launchpad", "tax"] as const).map((row) => (
                  <div
                    key={row}
                    className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 px-6 py-4"
                  >
                    <dt className="w-44 shrink-0 text-xs font-bold uppercase tracking-widest text-blue-500">
                      {t(`token.table.${row}`)}
                    </dt>
                    <dd className="text-neutral-200">
                      {t(`token.table.${row}Value`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>

            <h3 className="mt-12 mb-5 text-xl font-bold text-white">
              {t("token.taxTitle")}
            </h3>
            <div className="grid sm:grid-cols-3 gap-4 max-w-3xl">
              {tokenTaxCards.map((key) => (
                <Card key={key}>
                  <p className="text-4xl font-extrabold text-blue-400">
                    {t(`token.tax.${key}.pct`)}
                  </p>
                  <p className="mt-2 font-semibold text-white">
                    {t(`token.tax.${key}.title`)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                    {t(`token.tax.${key}.body`)}
                  </p>
                </Card>
              ))}
            </div>

            <p className="mt-6 max-w-2xl leading-relaxed text-neutral-300">
              {t("token.note")}
            </p>
          </section>

          <section id="contract" className="scroll-mt-24 py-10">
            <Eyebrow>{t("contract.eyebrow")}</Eyebrow>
            <SectionTitle>{t("contract.title")}</SectionTitle>
            <p className="max-w-2xl leading-relaxed text-neutral-300">
              {t("contract.intro")}
            </p>

            <h3 className="mt-10 mb-3 text-xl font-bold text-white">
              {t("contract.epochsTitle")}
            </h3>
            <p className="max-w-2xl leading-relaxed text-neutral-300">
              {t("contract.epochsBody")}
            </p>

            <h3 className="mt-10 mb-5 text-xl font-bold text-white">
              {t("contract.claimTitle")}
            </h3>
            <div className="grid sm:grid-cols-3 gap-4 max-w-3xl">
              {claimSteps.map((key, i) => (
                <Card key={key}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-black text-sm font-extrabold">
                    {i + 1}
                  </div>
                  <p className="mt-3 font-semibold text-white">
                    {t(`contract.claim.${key}.title`)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                    {t(`contract.claim.${key}.body`)}
                  </p>
                </Card>
              ))}
            </div>

            <h3 className="mt-10 mb-5 text-xl font-bold text-white">
              {t("contract.safetyTitle")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3 max-w-3xl">
              {safetyRules.map((rule) => (
                <div
                  key={rule}
                  className="flex gap-3 items-start rounded-xl border border-blue-900/50 bg-zinc-900/30 px-4 py-3"
                >
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm text-neutral-300 leading-relaxed">
                    {t(`contract.safety.${rule}`)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 max-w-3xl">
              <Callout>{t.rich("contract.callout", rich)}</Callout>
            </div>
          </section>

          <section id="webapp" className="scroll-mt-24 py-10">
            <Eyebrow>{t("webapp.eyebrow")}</Eyebrow>
            <SectionTitle>{t("webapp.title")}</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
              {webappFeatures.map((key) => (
                <Card key={key} className="!p-5">
                  <p className="font-semibold text-white">
                    {t(`webapp.features.${key}.title`)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                    {t(`webapp.features.${key}.body`)}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section id="community" className="scroll-mt-24 py-10">
            <Eyebrow>{t("community.eyebrow")}</Eyebrow>
            <SectionTitle>{t("community.title")}</SectionTitle>
            <p className="max-w-2xl leading-relaxed text-neutral-300">
              {t("community.intro")}
            </p>

            <h3 className="mt-10 mb-5 text-xl font-bold text-white">
              {t("community.findUsTitle")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
              <Card className="!p-5">
                <p className="font-semibold text-white">
                  {t("community.telegram.title")}
                </p>
                <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                  {t("community.telegram.body")}
                </p>
                <a
                  href={SOCIAL_TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm font-semibold text-blue-400 hover:text-blue-300"
                >
                  {t("community.telegram.link")}
                </a>
              </Card>
              <Card className="!p-5">
                <p className="font-semibold text-white">
                  {t("community.xSpaces.title")}
                </p>
                <p className="mt-1 text-sm text-neutral-400 leading-relaxed">
                  {t("community.xSpaces.body")}
                </p>
                <a
                  href={SOCIAL_X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm font-semibold text-blue-400 hover:text-blue-300"
                >
                  {t("community.xSpaces.link")}
                </a>
              </Card>
            </div>

            <h3 className="mt-10 mb-3 text-xl font-bold text-white">
              {t("community.earnTitle")}
            </h3>
            <p className="max-w-2xl leading-relaxed text-neutral-300">
              {t("community.earnIntro")}
            </p>
            <ul className="mt-4 space-y-2.5 max-w-2xl">
              {communityEarn.map((key) => (
                <li
                  key={key}
                  className="flex gap-3 items-start text-neutral-300 leading-relaxed"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <span>{t.rich(`community.earn.${key}`, rich)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 max-w-3xl">
              <Callout>{t("community.callout")}</Callout>
            </div>
          </section>

          <section id="links" className="scroll-mt-24 py-10">
            <Eyebrow>{t("links.eyebrow")}</Eyebrow>
            <SectionTitle>{t("links.title")}</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
              {officialLinks.map((link) => {
                const className =
                  "rounded-2xl border border-blue-900/60 bg-zinc-900/30 p-5 hover:border-blue-500 transition-colors";
                const content = (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-500">
                      {t(`links.items.${link.key}.label`)}
                    </p>
                    <p className="mt-1 font-semibold text-white">
                      {t(`links.items.${link.key}.value`)}
                    </p>
                  </>
                );

                if (link.external) {
                  return (
                    <a
                      key={link.key}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {content}
                    </a>
                  );
                }

                return (
                  <Link key={link.key} href={link.href} className={className}>
                    {content}
                  </Link>
                );
              })}
            </div>
            <p className="mt-5 text-sm text-neutral-500 max-w-2xl">
              {t.rich("links.trustNote", rich)}
            </p>
          </section>

          <section id="disclaimer" className="scroll-mt-24 py-10">
            <Eyebrow>{t("disclaimer.eyebrow")}</Eyebrow>
            <SectionTitle>{t("disclaimer.title")}</SectionTitle>
            <p className="max-w-3xl text-sm leading-relaxed text-neutral-400">
              {t("disclaimer.body")}
            </p>

            <footer className="mt-16 border-t border-blue-900/50 pt-6 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <DocsLogo className="h-8 w-auto" />
                <span className="text-sm text-neutral-500">
                  {t("brandName")}
                  <span className="text-blue-500">.</span> · mundial.xyz
                </span>
              </div>
            </footer>
          </section>
        </main>
      </div>
    </div>
  );
}
