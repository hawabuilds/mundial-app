"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DM_Mono, Figtree } from "next/font/google";
import { FAQ_ITEMS, faqItemHasTopic, type FaqItemId } from "../data/faqItems";
import { buildFaqHaystack } from "../data/faqSearchText";
import {
  faqSearchScore,
  isClaimRelatedQuery,
  isTaxRelatedQuery,
} from "../lib/faqSearch";
import { LAND_LOGO_SRC } from "../components/landing-assets/logo";
import SiteFooter from "../components/SiteFooter";
import styles from "./Faq.module.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-figtree",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

const LINK_PATTERN =
  /(mundial\.xyz\/disclaimer|mundial\.xyz\/faq)/g;

function FaqAnswer({ text }: { text: string }) {
  const parts = text.split(LINK_PATTERN);

  return (
    <p className={styles.answer}>
      {parts.map((part, index) => {
        if (part === "mundial.xyz/disclaimer") {
          return (
            <Link
              key={index}
              href="/disclaimer"
              className={styles.inlineLink}
            >
              mundial.xyz/disclaimer
            </Link>
          );
        }
        if (part === "mundial.xyz/faq") {
          return (
            <Link key={index} href="/faq" className={styles.inlineLink}>
              mundial.xyz/faq
            </Link>
          );
        }
        return part;
      })}
    </p>
  );
}

function FaqContent() {
  const searchParams = useSearchParams();
  const t = useTranslations("faq");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<FaqItemId | null>(null);
  const [copiedId, setCopiedId] = useState<FaqItemId | null>(null);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const term = query.trim();
    const params = new URLSearchParams(window.location.search);
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [query]);

  useEffect(() => {
    const hash = window.location.hash.slice(1) as FaqItemId;
    if (!hash) {
      return;
    }

    const isValid = FAQ_ITEMS.some((item) => item.id === hash);
    if (!isValid) {
      return;
    }

    setHighlightId(hash);
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    const timer = window.setTimeout(() => setHighlightId(null), 2400);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredItems = useMemo(() => {
    const term = query.trim();
    if (!term) {
      return FAQ_ITEMS;
    }

    const ranked = FAQ_ITEMS.map((item) => {
      const question = t(`items.${item.key}.question`);
      const answer = t(`items.${item.key}.answer`);
      const haystack = buildFaqHaystack(
        item.key,
        question,
        answer,
        item.keywords,
      );
      const score = faqSearchScore(haystack, term, item.keywords);
      return { item, score };
    })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    if (isTaxRelatedQuery(term)) {
      const taxResults = ranked.filter(({ item }) => faqItemHasTopic(item, "tax"));
      if (taxResults.length > 0) {
        return taxResults.map(({ item }) => item);
      }
    }

    if (isClaimRelatedQuery(term)) {
      const claimResults = ranked.filter(({ item }) =>
        faqItemHasTopic(item, "claim"),
      );
      if (claimResults.length > 0) {
        return claimResults.map(({ item }) => item);
      }
    }

    return ranked.map(({ item }) => item);
  }, [query, t]);

  const copyAnswer = useCallback(
    async (id: FaqItemId, question: string, answer: string) => {
      const text = `Q: ${question}\nA: ${answer}`;
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId(null), 2000);
      } catch {
        // Clipboard unavailable — no fallback needed for answer text.
      }
    },
    [],
  );

  return (
    <main className={styles.body}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src={LAND_LOGO_SRC} alt={tc("scoreLogoAlt")} />
      <h1 className={styles.title}>{t("pageTitle")}</h1>
      <p className={styles.subtitle}>{t("subtitle")}</p>

      <div className={styles.searchWrap}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          enterKeyHint="search"
        />
        {query ? (
          <button
            type="button"
            className={styles.clearSearch}
            onClick={() => setQuery("")}
            aria-label={t("clearSearch")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>

      <p className={styles.meta}>
        {t("resultsCount", { count: filteredItems.length })}
      </p>

      {filteredItems.length === 0 ? (
        <p className={styles.noResults}>{t("noResults")}</p>
      ) : (
        <div className={styles.list}>
          {filteredItems.map(({ id, key }) => {
            const question = t(`items.${key}.question`);
            const answer = t(`items.${key}.answer`);

            return (
            <article
              key={id}
              id={id}
              className={`${styles.item} ${highlightId === id ? styles.itemHighlighted : ""}`}
            >
              <h2 className={styles.question}>{question}</h2>
              <FaqAnswer text={answer} />
              <div className={styles.itemFooter}>
                <button
                  type="button"
                  className={`${styles.copyButton} ${copiedId === id ? styles.copyButtonCopied : ""}`}
                  onClick={() => copyAnswer(id, question, answer)}
                  aria-label={
                    copiedId === id ? t("answerCopied") : t("copyAnswer")
                  }
                >
                  {copiedId === id ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

export default function FaqPage() {
  const t = useTranslations("faq");

  return (
    <div className={`${styles.root} ${figtree.variable} ${dmMono.variable}`}>
      <div className={styles.app}>
        <header className={styles.nav}>
          <Link href="/" className={styles.back}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t("backHome")}
          </Link>
        </header>

        <Suspense fallback={<p className={styles.loading}>{t("loading")}</p>}>
          <FaqContent />
        </Suspense>

        <SiteFooter />
      </div>
    </div>
  );
}
