import type { IpcResult } from '@ai-digital-life/kernel';

export type { IpcResult };

export interface WebFetchResult {
  url: string;
  status: number;
  content_type: string | null;
  content: string;
  truncated: boolean;
  format: string;
  error: string | null;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
}

export interface WebSearchResult {
  query: string;
  results: SearchResultItem[];
  error: string | null;
}

export interface WebToolsBridge {
  webFetch(url: string, format?: string): Promise<IpcResult<WebFetchResult>>;
  webSearch(query: string): Promise<IpcResult<WebSearchResult>>;
}
