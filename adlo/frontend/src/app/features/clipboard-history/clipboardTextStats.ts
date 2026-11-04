export interface ClipboardTextStats {
  chars: number;
  charsNoSpace: number;
  lines: number;
}

/** 文本统计：字符数、不含空白字符数、行数（空串为 0 行）。 */
export function clipboardTextStats(text: string): ClipboardTextStats {
  if (text.length === 0) {
    return { chars: 0, charsNoSpace: 0, lines: 0 };
  }
  const whitespace = /\s/;
  let chars = 0;
  let charsNoSpace = 0;
  for (const ch of text) {
    chars += 1;
    if (!whitespace.test(ch)) {
      charsNoSpace += 1;
    }
  }
  return { chars, charsNoSpace, lines: text.split('\n').length };
}
