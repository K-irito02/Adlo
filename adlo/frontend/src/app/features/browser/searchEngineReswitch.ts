import type { SearchEngine } from '@stores/slices/browserSearchEnginesSlice';
import { buildSearchUrl, extractSearchQueryFromUrl } from './browserUrlUtils';

export interface ReswitchedSearch {
  url: string;
  query: string;
  title: string;
}

/**
 * 把「当前正在显示的搜索结果页」换成新引擎的同一查询。
 *
 * 仅当当前 URL 能被某个已知引擎的模板识别为搜索页时返回结果；普通网页返回 null，
 * 调用方据此保持页面不动（切换引擎不应无意义地重载普通页面）。
 */
export function buildReswitchedSearch(
  currentUrl: string,
  engines: SearchEngine[],
  engine: SearchEngine,
): ReswitchedSearch | null {
  const query = extractSearchQueryFromUrl(currentUrl, engines);
  if (!query) {
    return null;
  }
  return {
    url: buildSearchUrl(engine, query),
    query,
    title: `${engine.name}: ${query}`,
  };
}
