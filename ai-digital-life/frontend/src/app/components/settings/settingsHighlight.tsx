import type { ReactNode } from 'react';

/**
 * 命中词在文本中的下标（大小写不敏感、忽略查询两端空白）；未命中或空查询返回 -1。
 * `<mark>` 高亮与结果行的「命中行」补显共用同一判定 —— 避免出现「补显了却没高亮」的两处漂移。
 */
export function matchIndexOf(text: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return -1;
  }
  return text.toLowerCase().indexOf(needle);
}

/**
 * 将文本中首个与 query 匹配的片段用 `<mark>` 高亮（大小写不敏感的子串匹配）。
 * 跨组搜索结果与设置项行内高亮共用同一份命中口径（防两处漂移）。
 * 空查询或未命中时原样返回文本。
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const idx = matchIndexOf(text, query);
  if (idx === -1) {
    return text;
  }
  const length = query.trim().length;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="adl-settings-highlight">{text.slice(idx, idx + length)}</mark>
      {text.slice(idx + length)}
    </>
  );
}
