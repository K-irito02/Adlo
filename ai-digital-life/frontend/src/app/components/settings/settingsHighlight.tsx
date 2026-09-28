import type { ReactNode } from 'react';

/**
 * 将文本中首个与 query 匹配的片段用 `<mark>` 高亮（大小写不敏感的子串匹配）。
 * 跨组搜索结果与设置项行内高亮共用同一份命中口径（防两处漂移）。
 * 空查询或未命中时原样返回文本。
 */
export function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) {
    return text;
  }
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, idx)}
      <mark className="adl-settings-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
