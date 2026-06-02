import type { CopyDict, Locale } from "./types";
import { copy } from "./types";

export function formatNewFolderName(t: CopyDict, index: number): string {
  return `${t.browserNewFolderName}${index}`;
}

export function formatNewFolderNameByLocale(locale: Locale, index: number): string {
  return formatNewFolderName(copy[locale], index);
}
