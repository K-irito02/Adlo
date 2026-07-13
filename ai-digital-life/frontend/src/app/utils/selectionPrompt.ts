import type { Locale } from '../i18n';
import { loadLocale } from '../i18n/i18nLoader';

export async function buildSelectionPrompt(locale: Locale, filePath: string, selection: string): Promise<string> {
  if (locale === 'en-US') {
    return `@${filePath}\n\nContinue from this selection:\n\`\`\`\n${selection}\n\`\`\``;
  }
  const t = await loadLocale(locale);
  return `@${filePath}\n\n${t.selectionPromptZh}\`\`\`\n${selection}\n\`\`\``;
}
