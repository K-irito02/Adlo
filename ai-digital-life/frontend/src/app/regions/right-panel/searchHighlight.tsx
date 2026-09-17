import React from 'react';

/**
 * 将文本中与 query 匹配的片段用项目黄色警示色高亮。
 * 使用普通子串匹配（不走正则，避免特殊字符转义问题）。
 */
export function highlightMatch(text: string, query: string, matchCase: boolean): React.ReactNode {
  if (!text || !query) {
    return text;
  }
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
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
