/** 归一单个白名单行到 origin（`scheme://host[:port]`）。非 http/https 或无 host → null。 */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (!url.host) {
    return null;
  }
  return url.origin;
}

/** 解析多行文本为 origin 列表：归一、去重（保序）、分离非法行。 */
export function parseWhitelistLines(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const origin = normalizeOrigin(line);
    if (!origin) {
      invalid.push(line.trim());
      continue;
    }
    if (!seen.has(origin)) {
      seen.add(origin);
      origins.push(origin);
    }
  }
  return { origins, invalid };
}
