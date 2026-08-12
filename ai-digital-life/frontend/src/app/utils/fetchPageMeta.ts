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

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), PREFETCH_TIMEOUT);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function fetchPageMeta(url: string): Promise<PageMeta | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }
  try {
    if (isTauriShell()) {
      const raw = await withTimeout(invoke('browser_fetch_page_meta', { url }));
      const result = raw as { ok: boolean; data?: PageMeta };
      if (result?.ok && result.data) {
        return result.data;
      }
    } else {
      const meta = (await withTimeout(fetchPageMetaHttp(url))) as PageMeta | null;
      return meta;
    }
  } catch {
    return null;
  }
  return null;
}

export async function prefetchPageMeta(
  url: string,
  options?: { force?: boolean },
): Promise<PageMeta | null> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null;
  }
  try {
    if (isTauriShell()) {
      const raw = await withTimeout(
        invoke('browser_fetch_page_meta', { url, force: options?.force ?? false }),
      );
      const result = raw as { ok: boolean; data?: PageMeta };
      if (result?.ok && result.data) {
        return result.data;
      }
      return null;
    }
    const meta = (await withTimeout(fetchPageMetaHttp(url))) as PageMeta | null;
    return meta;
  } catch {
    return null;
  }
}
