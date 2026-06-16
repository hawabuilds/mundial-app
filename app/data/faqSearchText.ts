import en from "../../messages/en.json";
import type { FaqItemKey } from "./faqItems";

export function buildFaqHaystack(
  key: FaqItemKey,
  localeQuestion: string,
  localeAnswer: string,
  keywords: readonly string[],
): string {
  const enItem = en.faq.items[key];

  return [
    localeQuestion,
    localeAnswer,
    enItem?.question ?? "",
    enItem?.answer ?? "",
    ...keywords,
  ].join(" ");
}
