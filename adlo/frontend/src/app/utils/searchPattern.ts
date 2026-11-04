export interface SearchPatternOptions {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 把查询词编译为正则（搜索面板与剪贴板搜索共用）：
 * 非正则模式先转义；全字匹配包 `\\b`；空白查询视为空查询返回 `undefined`；
 * 非法正则同样返回 `undefined`，由调用方按"无结果"处理。
 */
export function buildSearchPattern(
  query: string,
  options: SearchPatternOptions,
): RegExp | undefined {
  if (!query.trim()) {
    return undefined;
  }
  const source = options.useRegex ? query : escapeRegExp(query);
  const wrapped = options.wholeWord ? `\\b${source}\\b` : source;
  try {
    return new RegExp(wrapped, options.matchCase ? 'g' : 'gi');
  } catch {
    return undefined;
  }
}
