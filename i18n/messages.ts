import en from "../messages/en.json";
import type { AppLocale } from "./config";

export const messagesByLocale = {
  en,
} as const satisfies Record<AppLocale, typeof en>;

export function getMessages(locale: AppLocale) {
  return messagesByLocale[locale];
}
