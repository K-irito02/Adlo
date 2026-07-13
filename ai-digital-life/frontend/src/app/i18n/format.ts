import type { CopyDict, Locale } from './types';
import { loadLocale } from './i18nLoader';

export function formatNewFolderName(t: CopyDict, index: number): string {
  return `${t.browserNewFolderName}${index}`;
}

export async function formatNewFolderNameByLocale(locale: Locale, index: number): Promise<string> {
  const t = await loadLocale(locale);
  return formatNewFolderName(t, index);
}
