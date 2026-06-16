export const locales = ["en"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

export function isAppLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale);
}
