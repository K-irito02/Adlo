export function normalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url);
    // 剥离 modal_id：SPA 中 base≡modal_id 同属一页（抖音等），否则 base 与
    // modal_id 变体被判为不同 URL，引发 urlChanged 误判/缓存 miss。
    if (u.searchParams.has('modal_id')) {
      const kept = [...u.searchParams.entries()].filter(([k]) => k !== 'modal_id');
      u.search = kept.length ? `?${new URLSearchParams(kept).toString()}` : '';
    }
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    const noHash = url.split('#')[0] || url;
    if (noHash.length > 8 && noHash.endsWith('/')) {
      return noHash.replace(/\/+$/, '');
    }
    return noHash;
  }
}

export function isProbablySameSite(expected: string, actual: string): boolean {
  try {
    const expectedHost = new URL(expected).hostname;
    const actualHost = new URL(actual).hostname;
    if (expectedHost === actualHost) {
      return true;
    }
    const expectedParts = expectedHost.split('.');
    const actualParts = actualHost.split('.');
    if (expectedParts.length >= 2 && actualParts.length >= 2) {
      const expectedRoot = expectedParts.slice(-2).join('.');
      const actualRoot = actualParts.slice(-2).join('.');
      if (expectedRoot === actualRoot) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

import type { SearchEngine } from '../../stores/slices/browserSearchEnginesSlice';

export type { SearchEngine } from '../../stores/slices/browserSearchEnginesSlice';

/**
 * 判断输入是否为搜索词（而非 URL）
 */
export function isSearchQuery(input: string): boolean {
  const trimmed = input.trim();
  // 已有协议 → 导航
  if (/^[a-z]+:\/\//i.test(trimmed)) return false;
  // about: 协议 → 导航
  if (/^about:/i.test(trimmed)) return false;
  // IP 地址 → 导航
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return false;
  // localhost → 导航
  if (/^localhost(:\d+)?/.test(trimmed)) return false;
  // 含空格 → 搜索
  if (/\s/.test(trimmed)) return true;
  // 含中文 → 搜索
  if (/[\u4e00-\u9fff]/.test(trimmed)) return true;
  // 无点号 → 搜索
  if (!/\./.test(trimmed)) return true;
  // 其它按 URL 处理
  return false;
}

/**
 * 构建搜索 URL
 */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.urlTemplate.replace('%s', encodeURIComponent(query));
}

/**
 * 确保输入有协议前缀
 */
export function ensureProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  if (/^about:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * 从搜索结果 URL 中提取用户查询文本。
 * 匹配已知搜索引擎的 URL 模板，返回解码后的查询词；
 * 非搜索 URL 返回空字符串。
 */
export function extractSearchQueryFromUrl(url: string, engines: SearchEngine[]): string {
  try {
    const u = new URL(url);
    for (const engine of engines) {
      try {
        const tpl = new URL(engine.urlTemplate.replace('%s', '___PLACEHOLDER___'));
        if (u.hostname !== tpl.hostname) continue;
        const paramName = [...tpl.searchParams.keys()].find(
          (k) => tpl.searchParams.get(k) === '___PLACEHOLDER___',
        );
        if (!paramName) continue;
        const raw = u.searchParams.get(paramName);
        if (raw) return decodeURIComponent(raw);
      } catch {
        // 跳过无效模板
      }
    }
  } catch {
    // 无效 URL
  }
  return '';
}
