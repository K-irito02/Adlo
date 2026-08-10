export function splitMarkdownIncrements(prevText: string, nextText: string): string {
  if (nextText.startsWith(prevText)) {
    return nextText.slice(prevText.length);
  }
  return nextText;
}
