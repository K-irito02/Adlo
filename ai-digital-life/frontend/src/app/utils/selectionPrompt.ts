import type { Locale } from "../i18n";

export function buildSelectionPrompt(locale: Locale, filePath: string, selection: string): string {
  if (locale === "en-US") {
    return `@${filePath}\n\nContinue from this selection:\n\`\`\`\n${selection}\n\`\`\``;
  }
  return `@${filePath}\n\n请基于以下选区继续工作：\n\`\`\`\n${selection}\n\`\`\``;
}
