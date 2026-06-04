import type { Locale } from '../i18n';
import { copy } from '../i18n';

export function buildSelectionPrompt(locale: Locale, filePath: string, selection: string): string {
  if (locale === 'en-US') {
    return `@${filePath}\n\nContinue from this selection:\n\`\`\`\n${selection}\n\`\`\``;
  }
  const t = copy[locale];
  return `@${filePath}\n\n${t.selectionPromptZh}\`\`\`\n${selection}\n\`\`\``;
}
