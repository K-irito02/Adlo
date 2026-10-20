import { isTauriShell, invokeIpc } from '../../tauri-bridge/tauri-shared';
import { listen } from '@tauri-apps/api/event';
import { requestPreviewApi } from '../../shared/ipc/preview-api';
import type { PageMeta, PageMetaUpdatedPayload, MetaSource } from '../../shared/ipc/browser';
import type { SiteMetaCacheEntry } from './siteMetaBackends/types';
import { applyBroadcastUpdate, getCachedSiteMeta } from './siteMetaCache';

export interface PageMetaClient {
  peek(url: string): SiteMetaCacheEntry | undefined;
  get(url: string, opts?: { force?: boolean }): Promise<PageMeta | null>;
  getSilent(url: string): Promise<PageMeta | null>;
  report(meta: PageMeta, source: MetaSource): Promise<void>;
  refresh(url: string): Promise<PageMeta | null>;
  warmup(urls: string[]): Promise<void>;
  subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
}

const EVENT = 'digital-life://page-meta-updated';

/** 调试日志里的 URL 剥离一次性认证参数（R1-Medium：`getSilent` 日志进收起器落盘）。 */
function redactUrlForLog(url: string): string {
  const idx = url.indexOf('?');
  if (idx < 0) {
    return url;
  }
  const [base, query] = [url.slice(0, idx), url.slice(idx + 1)];
  const kept = query.split('&').filter((p) => p.split('=')[0] !== 'token');
  return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
}

export const pageMetaClient: PageMetaClient = isTauriShell()
  ? {
      peek: (url) => getCachedSiteMeta(url),
      get: async (url, opts) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_get', {
          url,
          force: opts?.force ?? false,
        });
        return r.ok && r.data ? r.data : null;
      },
      getSilent: async (url) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_get_silent', { url });
        let logEntry: Record<string, unknown>;
        if (r.ok) {
          logEntry = {
            ok: true,
            code: null,
            errMsg: null,
            hasData: true,
            metaTitle: r.data.title,
            faviconLen: r.data.favicon?.length ?? null,
          };
        } else {
          logEntry = {
            ok: false,
            code: r.error.code,
            errMsg: r.error.message,
            hasData: false,
            metaTitle: null,
            faviconLen: null,
          };
        }
        console.info('[page-meta] getSilent(TAURI-branch)', {
          url: redactUrlForLog(url),
          ...logEntry,
        });
        return r.ok && r.data ? r.data : null;
      },
      report: async (meta, source) => {
        await invokeIpc<void>('browser_page_meta_report', {
          url: meta.url,
          title: meta.title ?? '',
          favicon: meta.favicon ?? '',
          source,
        });
      },
      refresh: async (url) => {
        const r = await invokeIpc<PageMeta>('browser_page_meta_refresh', { url });
        return r.ok && r.data ? r.data : null;
      },
      warmup: async (urls) => {
        await invokeIpc<void>('browser_page_meta_warmup', { urls });
      },
      subscribeUpdated: (listener) => {
        let active = true;
        let unlisten: (() => void) | undefined;
        void listen<PageMetaUpdatedPayload>(EVENT, (e) => {
          if (active) {
            listener(e.payload);
          }
        })
          .then((u) => {
            if (active) {
              unlisten = u;
            } else {
              void Promise.resolve(u()).catch(() => {});
            }
          })
          .catch(() => {});
        return () => {
          active = false;
          void Promise.resolve(unlisten?.()).catch(() => {});
        };
      },
    }
  : {
      peek: (url) => getCachedSiteMeta(url),
      get: async (url, opts) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/get', {
          method: 'POST',
          body: JSON.stringify({ url, force: opts?.force ?? false }),
        });
        return r.ok && r.data ? r.data : null;
      },
      getSilent: async (url) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/get', {
          method: 'POST',
          body: JSON.stringify({ url, force: false }),
        });
        let logEntry: Record<string, unknown>;
        if (r.ok) {
          logEntry = {
            ok: true,
            code: null,
            errMsg: null,
            hasData: true,
            metaTitle: r.data.title,
            faviconLen: r.data.favicon?.length ?? null,
          };
        } else {
          logEntry = {
            ok: false,
            code: r.error.code,
            errMsg: r.error.message,
            hasData: false,
            metaTitle: null,
            faviconLen: null,
          };
        }
        console.info('[page-meta] getSilent(PREVIEW-branch/http-crawler)', {
          url: redactUrlForLog(url),
          ...logEntry,
        });
        return r.ok && r.data ? r.data : null;
      },
      report: async (meta, source) => {
        await requestPreviewApi<void>('/browser/page-meta/report', {
          method: 'POST',
          body: JSON.stringify({
            url: meta.url,
            title: meta.title ?? '',
            favicon: meta.favicon ?? '',
            source,
          }),
        });
      },
      refresh: async (url) => {
        const r = await requestPreviewApi<PageMeta>('/browser/page-meta/refresh', {
          method: 'POST',
          body: JSON.stringify({ url }),
        });
        const meta = r.ok && r.data ? r.data : null;
        // 预览模式无事件（subscribeUpdated no-op），刷新结果直接落地镜像
        if (meta) {
          applyBroadcastUpdate({
            url: meta.url,
            title: meta.title,
            faviconUrl: meta.favicon,
            faviconDataUri: meta.faviconDataUri || '',
            source: (meta.source as MetaSource | undefined) || 'http',
          });
        }
        return meta;
      },
      warmup: async (urls) => {
        const r = await requestPreviewApi<PageMeta[]>('/browser/page-meta/warmup', {
          method: 'POST',
          body: JSON.stringify({ urls }),
        });
        // 预览模式无事件（subscribeUpdated no-op），返回的 metas 直接落地镜像
        for (const meta of r.ok ? (r.data ?? []) : []) {
          applyBroadcastUpdate({
            url: meta.url,
            title: meta.title,
            faviconUrl: meta.favicon,
            faviconDataUri: meta.faviconDataUri || '',
            source: (meta.source as MetaSource | undefined) || 'http',
          });
        }
      },
      subscribeUpdated: () => () => {}, // 预览模式事件由 Task 12 previewPageMetaService 提供
    };
