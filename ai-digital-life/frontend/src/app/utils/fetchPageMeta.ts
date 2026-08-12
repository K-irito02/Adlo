import { isTauriShell } from '../../tauri-bridge';
import { invoke } from '@tauri-apps/api/core';
import type { PageMeta } from '../../shared/ipc/browser';

const PREFETCH_TIMEOUT = 5000;

async function fetchPageMetaHttp(url: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(`/__adl_preview_api__/browser/page-meta?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as PageMeta & { faviconDataUri?: string };
    return { title: data.title ?? '', favicon: data.favicon ?? '', faviconDataUri: data.faviconDataUri ?? '', url: data.url ?? url };
  } catch {
    return null;
  }
}

export async function fetchPageMeta(url: string): Promise<PageMeta | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }
  if (isTauriShell()) {
    try {
      const result = (await invoke('browser_fetch_page_meta', { url })) as {
        ok: boolean;
        data?: PageMeta;
      };
      if (result?.ok && result.data) return result.data;
    } catch {
      return null;
    }
    return null;
  }
  return fetchPageMetaHttp(url);
}

export async function prefetchPageMeta(
  url: string,
  options?: { force?: boolean },
): Promise<PageMeta | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }
  if (isTauriShell()) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT),
      );
      const result = (await Promise.race([
        invoke('browser_fetch_page_meta', { url, force: options?.force ?? false }),
        timeoutPromise,
      ])) as { ok: boolean; data?: PageMeta };
      if (result?.ok && result.data) return result.data;
    } catch {
      return null;
    }
    return null;
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT),
    );
    const meta = (await Promise.race([fetchPageMetaHttp(url), timeoutPromise])) as PageMeta | null;
    return meta;
  } catch {
    return null;
  }
}
