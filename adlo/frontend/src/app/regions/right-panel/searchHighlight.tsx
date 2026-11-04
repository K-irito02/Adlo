import React from 'react';
import { buildSearchPattern } from '@utils/searchPattern';

export interface HighlightOptions {
  matchCase: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}

/**
 * 将文本中与 query 匹配的片段用项目黄色警示色高亮。
 * 默认（文件名范围）用普通子串匹配（不走正则，避免特殊字符转义问题）；
 * 内容片段传入 wholeWord/useRegex 后走与检索一致的 `buildSearchPattern` 语义，
 * 非法正则回退子串。
 */
export function highlightMatch(
  text: string,
  query: string,
  matchCase: boolean,
  options?: HighlightOptions,
): React.ReactNode {
  if (!text || !query) {
    return text;
  }
  const pattern = buildSearchPattern(query, {
    matchCase: options?.matchCase ?? matchCase,
    wholeWord: options?.wholeWord ?? false,
    useRegex: options?.useRegex ?? false,
  });
  if (!pattern) {
    return highlightSubstring(text, query, matchCase);
  }
  // 同一实例复用（调用方保证单线程串行；lastIndex 每次归零）。
  const matcher = pattern;
  const parts: React.ReactNode[] = [];
  let from = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  matcher.lastIndex = 0;
  for (;;) {
    match = matcher.exec(text);
    if (!match || match[0].length === 0) {
      parts.push(text.slice(from));
      break;
    }
    if (match.index > from) {
      parts.push(text.slice(from, match.index));
    }
    parts.push(
      <mark key={key++} className="adl-search-highlight">
        {match[0]}
      </mark>,
    );
    from = match.index + match[0].length;
    if (from >= text.length) {
      break;
    }
  }
  return parts;
}

function highlightSubstring(text: string, query: string, matchCase: boolean): React.ReactNode {
  const hay = matchCase ? text : text.toLocaleLowerCase();
  const needle = matchCase ? query : query.toLocaleLowerCase();
  if (!needle || !hay.includes(needle)) {
    return text;
  }
  const parts: React.ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) {
      parts.push(text.slice(from));
      break;
    }
    if (idx > from) {
      parts.push(text.slice(from, idx));
    }
    parts.push(
      <mark key={key++} className="adl-search-highlight">
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    from = idx + needle.length;
  }
  return parts;
}
