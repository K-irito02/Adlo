import type { WebToolsBridge, WebFetchResult, WebSearchResult } from '../shared/ipc/web_tools';
import { invokeIpc } from './tauri-shared';

export function createTauriWebToolsBridge(): WebToolsBridge {
  return {
    webFetch: (url, format) => invokeIpc<WebFetchResult>('web_fetch', { url, format }),
    webSearch: (query) => invokeIpc<WebSearchResult>('web_search', { query }),
  };
}
