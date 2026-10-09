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
  const charsNoSpace = [...text].filter((ch) => !/\s/.test(ch)).length;
  return { chars: [...text].length, charsNoSpace, lines: text.split('\n').length };
}
