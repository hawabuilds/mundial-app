"use client";

import { NextIntlClientProvider } from "next-intl";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { defaultLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

function DocumentLocaleSync() {
  const t = useTranslations("metadata");

  useEffect(() => {
    document.documentElement.lang = "en";
    document.title = t("title");
  }, [t]);

  return null;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={defaultLocale}
      messages={getMessages(defaultLocale)}
    >
      <DocumentLocaleSync />
      {children}
    </NextIntlClientProvider>
  );
}
