export function stripQuotedText(value: string): string {
  return value
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

export function countLeadingClosers(value: string, closers: string): number {
  let count = 0;
  for (const char of value.trimStart()) {
    if (!closers.includes(char)) {
      break;
    }
    count += 1;
  }
  return count;
}

export function countChars(value: string, chars: string): number {
  let count = 0;
  for (const char of value) {
    if (chars.includes(char)) {
      count += 1;
    }
  }
  return count;
}
